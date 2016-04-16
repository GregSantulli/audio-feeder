(function() {

	var BufferQueue = require('./buffer-queue.js'),
		Backend = require('./backend.js'),
		WebAudioBackend = require('./web-audio-backend.js'),
		FlashBackend = require('./flash-backend.js'),
		StubBackend = require('./stub-backend.js');


	/**
	 * Audio sample buffer format passed to {@link AudioFeeder#bufferData} and its backends.
	 *
	 * Buffers are arrays containing one Float32Array of sample data
	 * per channel. Channel counts must match the expected value, and
	 * all channels within a buffer must have the same length in samples.
	 *
	 * Since input data may be stored for a while before being taken
	 * back out, be sure that your Float32Arrays for channel data are
	 * standalone, not backed on an ArrayBuffer that might change!
	 *
	 * @typedef {SampleBuffer} SampleBuffer
	 * @todo consider replacing this with AudioBuffer-like wrapper object
	 */

	/**
	 * Object dictionary format used to pass options into {@link AudioFeeder} and its backends.
	 *
	 * @typedef {Object} AudioFeederOptions
	 * @property {string} base - (optional) base URL to find additional resources in,
	 *                           such as the Flash audio output shim
	 * @property {AudioContext} audioContext - (optional) Web Audio API AudioContext
	 *                          instance to use inplace of creating a default one
	 */

	/**
	 * Object dictionary format returned from {@link AudioFeeder#getPlaybackState} and friends.
	 *
	 * @typedef {Object} PlaybackState
	 * @property {number} playbackPosition - total seconds so far of audio data that have played
	 * @property {number} samplesQueued - number of samples at target rate that are queued up for playback
	 * @property {number} dropped - number of underrun events, when we had to play silence due to data starvation
	 * @property {number} delayedTime - total seconds so far of silent time during playback due to data starvation
	 * @todo drop 'dropped' in favor of delayedTime
	 * @todo replace sampledQueued with a time unit?
	 */

	/**
	 * Object that we can throw audio data into and have it drain out.
	 * @class
	 * @param {AudioFeederOptions} options - dictionary of config settings
	 *
	 * @classdesc
	 * Object that we can throw audio data into and have it drain out.
	 */
	function AudioFeeder(options) {
		this._options = options || {};
		this._backend = null; // AudioBackend instance, after init...
	};

	/**
	 * Sample rate in Hz, as requested by the caller in {@link AudioFeeder#init}.
	 *
	 * If the backend's actual sample rate differs from this requested rate,
	 * input data will be resampled automatically.
	 *
	 * @type {number}
	 * @readonly
	 */
	AudioFeeder.prototype.rate = 0;

	/**
	 * Number of output channels, as requested by the caller in {@link AudioFeeder#init}.
	 *
	 * If the backend's actual channel count differs from this requested count,
	 * input data will be resampled automatically.
	 *
	 * Warning: currently more than 2 channels may result in additional channels
	 * being cropped out, as downmixing has not yet been implemented.
	 *
	 * @type {number}
	 * @readonly
	 */
	AudioFeeder.prototype.channels = 0;

	/**
	 * Is the feeder currently set to mute output?
	 *
	 * @type {boolean}
	 * @readonly
	 * @see {AudioFeeder#mute}
	 * @see {AudioFeeder#unmute}
	 */
	AudioFeeder.prototype.muted = false;

	/**
	 * Start setting up for output with the given channel count and sample rate.
	 * Audio data you provide will be resampled if necessary to whatever the
	 * backend actually supports.
	 *
	 * @param {number} numChannels - requested number of channels (output may differ)
	 * @param {number} sampleRate - requested sample rate in Hz (output may differ)
	 *
	 * @todo merge into constructor?
	 */
	AudioFeeder.prototype.init = function(numChannels, sampleRate) {
		this.channels = numChannels;
		this.rate = sampleRate;

		if (WebAudioBackend.isSupported()) {
			this._backend = new WebAudioBackend(numChannels, sampleRate, this._options);
		} else if (FlashBackend.isSupported()) {
			this._backend = new FlashBackend(numChannels, sampleRate, this._options);
		} else {
			this._backend = new StubBackend(numChannels, sampleRate, this._options);
		}
	};

	/**
	 * Resample a buffer from the input rate/channel count to the output.
	 *
	 * This is horribly naive and wrong.
	 * Replace me with a better algo!
	 *
	 * @param {SampleBuffer} sampleData - input data in requested sample rate / channel count
	 * @returns {SampleBuffer} output data in backend's sample rate/channel count
	 */
	AudioFeeder.prototype._resample = function(sampleData) {
		var rate = this.rate,
			channels = this.channels,
			targetRate = this._backend.rate,
			targetChannels = this._backend.channels;

		if (rate == targetRate && channels == targetChannels) {
			return sampleData;
		} else {
			var newSamples = [];
			for (var channel = 0; channel < targetChannels; channel++) {
				var inputChannel = channel;
				if (channel >= channels) {
					// Flash forces output to stereo; if input is mono, dupe the first channel
					inputChannel = 0;
				}
				var input = sampleData[inputChannel],
					output = new Float32Array(Math.round(input.length * targetRate / rate));
				for (var i = 0; i < output.length; i++) {
					output[i] = input[(i * rate / targetRate) | 0];
				}
				newSamples.push(output);
			}
			return newSamples;
		}
	};

	/**
	 * Queue up some audio data for playback.
	 *
	 * @param {SampleBuffer} sampleData - input data to queue up for playback
	 *
	 * @todo throw if data invalid or uneven
	 */
	AudioFeeder.prototype.bufferData = function(sampleData) {
		if (this._backend) {
			var samples = this._resample(sampleData);
			this._backend.appendBuffer(samples);
		} else {
			throw 'Invalid state: AudioFeeder cannot bufferData before init';
		}
	};

	/**
	 * Get an object with information about the current playback state.
	 *
	 * @return {PlaybackState} - info about current playback state
	 */
	AudioFeeder.prototype.getPlaybackState = function() {
		if (this._backend) {
			return this._backend.getPlaybackState();
		} else {
			throw 'Invalid state: AudioFeeder cannot getPlaybackState before init';
		}
	};

	/**
	 * @todo replace with volume property
	 */
	AudioFeeder.prototype.mute = function() {
		this.muted = true;
		this._backend.mute();
	};

	/**
	 * @todo replace with volume property
	 */
	AudioFeeder.prototype.unmute = function() {
		this.muted = false;
		this._backend.unmute();
	};

	/**
	 * Checks if audio system is ready and calls the callback when ready
	 * to begin playback.
	 *
	 * This will wait for the Flash shim to load on IE 10/11; waiting
	 * is not required when using native Web Audio but you should use
	 * this callback to support older browsers.
	 *
	 * @param {function} callback - called when ready
	 */
	AudioFeeder.prototype.waitUntilReady = function(callback) {
		if (this._backend) {
			this._backend.waitUntilReady(callback);
		} else {
			throw 'Invalid state: AudioFeeder cannot waitUntilReady before init';
		}
	};

	/**
	 * Start/continue playback as soon as possible.
	 *
	 * You should buffer some audio ahead of time to avoid immediately
	 * running into starvation.
	 */
	AudioFeeder.prototype.start = function() {
		if (this._backend) {
			this._backend.start();
		} else {
			throw 'Invalid state: AudioFeeder cannot start before init';
		}
	};

	/**
	 * Stop/pause playback as soon as possible.
	 *
	 * Audio that has been buffered but not yet sent to the device will
	 * remain buffered, and can be continued with another call to start().
	 */
	AudioFeeder.prototype.stop = function() {
		if (this._backend) {
			this._backend.stop();
		} else {
			throw 'Invalid state: AudioFeeder cannot stop before init';
		}
	};

	/**
	 * Close out the audio channel. The AudioFeeder instance will no
	 * longer be usable after closing.
	 *
	 * @todo close out the AudioContext if no longer needed
	 * @todo make the instance respond more consistently once closed
	 */
	AudioFeeder.prototype.close = function() {
		if (this._backend) {
			this._backend.close();
			this._backend = null;
		}
	};

	/**
	 * A callback when we find we're out of buffered data.
	 *
	 * @type {function}
	 */
	AudioFeeder.prototype.onstarved = null;

	/**
	 * Is the AudioFeeder class supported in this browser?
	 *
	 * Note that it's still possible to be supported but not work, for instance
	 * if there are no audio output devices but the APIs are available.
	 *
	 * @returns {boolean} - true if Web Audio API is available
	 */
	AudioFeeder.isSupported = function() {
		return !!Float32Array && (WebAudioBackend.isSupported() || FlashBackend.isSupported());
	};

	/**
	 * Force initialization of the default Web Audio API context, if applicable.
	 *
	 * Some browsers (such as mobile Safari) disable audio output unless
	 * first triggered from a UI event handler; call this method as a hint
	 * that you will be starting up an AudioFeeder soon but won't have data
	 * for it until a later callback.
	 *
	 * @returns {AudioContext|null} - initialized AudioContext instance, if applicable
	 */
	AudioFeeder.initSharedAudioContext = function() {
		if (WebAudioBackend.isSupported()) {
			return WebAudioBackend.initSharedAudioContext();
		} else {
			return null;
		}
	};

	module.exports = AudioFeeder;

})();
