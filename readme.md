audio-feeder
============

The AudioFeeder class abstracts a buffered output pipe for uncompressed PCM
audio in the browser, supporting both the standard W3C Web Audio API and a
Flash-based fallback for IE 10/11.

AudioFeeder was written for the [ogv.js in-browser Ogg/WebM media player](https://github.com/brion/ogv.js),
and is suitable for use in custom audio and video playback.

## Copyright and license

* main AudioFeeder & Web Audio code path under MIT license, (c) 2013-2016 Brion Vibber
* dynamicaudio.as and Flash-related bits are based on code under BSD license, (c) 2010 Ben Firshman

## Updates

* 0.1.0 - 2016-04-16
 * Refactored code paths and build process!
 * Can now be imported directly into a webpack-based project
 * 'make build' to pre-build standalone .js to use in other build processes
* 0.0.2 - 2016-03-27
 * Broken out from ogv.js, cleaning up to publish as npm module

## Installing with webpack

If your project is built with webpack, it's easy to bundle up AudioFeeder's
JavaScript classes and the Flash shim for IE.

Add to your npm dependencies:

```
npm install audio-feeder
```

and in your using code, set up the class like so:

```
var AudioFeeder = require('audio-feeder');
```

The Flash shim dynamicaudio.swf (needed for IE 10/11) should be bundled
automatically along with your output, via the
[file-loader plugin for webpack](https://www.npmjs.com/package/file-loader).
However if you have additional build steps, you may need to ensure that
this file gets copied along with the .js and any other assets, and that
URL paths are correctly interpreted.

## Using in other build systems

If your main project doesn't use webpack, you can build a pre-packed
AudioFeeder.js with webpack locally, or download a pre-built release
archive from https://github.com/brion/audio-feeder/releases

AudioFeeder.js can then be directly loaded in a &lt;script>, or you can
use it in another packaging system.

You will need to ensure that dynamicaudio.swf is included along with your
bundled JS/HTML/etc output to support IE 10/11, and may need to manually set
the base path in the options to the AudioFeeder constructor.

Building:

1. make

## Usage

```
// Create a feeder object
var feeder = new AudioFeeder({
  // Supply the path to dynamicaudio.swf for IE 10/11 compatibility
  base: "/path/to/resources"
});

// Set up 2-channel stereo, 48 kHz sampling rate
feeder.init(2, 48000);

// Flash mode for IE 10/11 requires waiting.
feeder.waitUntilReady(function() {

  // Buffer some data before we start playback...
  //
  // Each channel gets its own 32-bit float array of samples;
  // this will be 0.25 seconds of silence at 2ch/48kHz.
  //
  // Note it's ok for each bufferData() call to have a different
  // number of samples, such as when working with a data format
  // with variable packet size (Vorbis).
  //
  feeder.bufferData([
    new Float32Array(12000),
    new Float32Array(12000)
  ]);

  // Start playback...
  feeder.start();

  document.querySelector('button.stop').addEventListener('click', function() {
    // You can pause output at any time:
    feeder.stop();
  });

  // Optional callback when the buffered data runs out!
  feeder.onstarved = function() {
    // We don't have more data, so we'll just close out here.
    feeder.close();

    // Beware this may be a performance-sensitive callback; it's recommended
    // to do expensive decoding or audio generation in a worker thread and
    // pass it through for buffering rather than doing on-demand decoding.
  };
});
```

See also the included demo.html file for a live sample web page.

## Options  

* audioContext: an AudioContext object to be use instead of creating a new one
* base: base path containing dynamicaudio.swf for IE 10/11 Flash fallback

## Data format

AudioFeeder works with 32-bit floating point PCM audio. Data packets are
represented as an array containing a separate Float32Array for each channel.

## Status and audio/video synchronization

Playback state including the current playback position in seconds can be
retrieved from the getPlaybackState() method:

```
{
  playbackPosition: Float /* seconds of sample data that have played back so far */,
  samplesQueued: Float /* samples remaining before the buffer empties out, approximate */,
  dropped: Integer /* count of buffer underrun events */,
  delayed: Float /* total seconds of silence played to cover underruns */
}
```

Warning: this structure may change before 1.0.

playbackPosition tracks the time via actual samples output, corrected for drops
and underruns. This value is suitable for use in scheduling output of synchronized
video frames.

## Events

There is currently only one supported event, the 'onstarved' property.
This is called if available buffered data runs out during playback.

Todo:
* add events for beginning of playback?
* add event for reaching a threshold near starvation
* add event for scheduled end of playback
* fix event callback with Flash backend

## Flash and Internet Explorer 10/11

Internet Explorer 10/11 do not support Web Audio but do bundle the Flash
player plugin on Windows 8/8.1. This is automatically used if detected
available.

Beware that the dynamicaudio.swf file must be made available for the Flash
fallback to work!

Flash output is resampled to 2-channel 44.1 kHz, which is the only supported
output format for dynamically generated audio in Flash.

## Rebuilding pre-packed AudioFeeder.js

The pre-packed AudioFeeder.js included in tarball releases can be built
from the source files.

Build prerequisites:
* bash
* make
* node.js / npm

```
# Fetch build dependencies (webpack, eslint etc)
npm install

# Lint and rebuild
make
```

This will produce a 'build' subdirectory containing a ready to use
AudioFeeder.js and dynamicaudio.swf, as well as a demo.html example
page.

It may or may not work to build on Windows given a suitable shell.
If having trouble with the Makefile, try calling via npm directly:

```
npm run-script lint
npm run-script build
```

## Rebuilding Flash shim

The Flash shim can be rebuilt from source using the Apache Flex SDK.
The Makefile in this project fetches a local copy of the SDK, which
is not conveniently packaged.

Building the Flash shim is known to work on Mac OS X and Linux.

Build prerequisites:

* bash
* make
* java
* ant
* curl

```
# Rebuild dynamicaudio.swf, installing Flex SDK if necessary
make swf
```

Be warned that downloading libraries for the Apache Flex SDK may prompt
you for permission at your terminal!

```
# To remove just the dynamicaudio.swf
make clean

# To remove the Flex SDK
make distclean
```
