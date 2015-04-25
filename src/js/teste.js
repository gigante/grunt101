/*
 * Copyright 2015 Google Inc. All rights reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not
 * use this file except in compliance with the License. You may obtain a copy of
 * the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS, WITHOUT
 * WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the
 * License for the specific language governing permissions and limitations under
 * the License.
 */


/**
 * @constructor
 */
var FauxTimeline = function() {
  var timing = { duration: 1000, iterations: Infinity };
  this.anim_ = this.buildPlayer_(null, [], timing);
  this.localTime_ = 0;
  this.players_ = [];
  this.calls_ = [];
};

FauxTimeline.prototype = {

  /**
   * Build an AnimationPlayer. Works around legacy vs. next polyfill.
   * @private
   */
  buildPlayer_: function(el, steps, timing) {
    el = el || document.body;
    if (el.animate) {
      return el.animate(steps, timing);
    }
    var anim = new Animation(el, steps, timing);
    return document.timeline.play(anim);
  },

  set playbackRate(v) {
    if (v < 0) {
      throw new Error('FauxTimeline doesn\'t support <0 playbackRate');
    }
    this.localTime_ = this.anim_.currentTime;
    this.anim_.playbackRate = v;
    this.players_.forEach(function(p) { p.playbackRate = v; });
  },

  get playbackRate() {
    return this.anim_.playbackRate;
  },

  get currentTime() {
    var time = this.anim_.currentTime;
    if (time === null) {
      console.debug('currentTime was null, returning fake localTime_');
      return this.localTime_;
    }
    return time;
  },

  /**
   * Seek to the specified time. Synchronously runs any registered calls.
   *
   * @param {number} to seek to, may not be in past
   */
  seek: function(to) {
    var delta = to - this.currentTime;
    if (delta < 0) {
      throw new Error('FauxTimeline doesn\'t support -ve seeks');
    }
    this.anim_.currentTime += delta;
    this.players_.forEach(function(p) { p.currentTime += delta; });

    this.calls_ = this.calls_.filter(function(p) {
      if (p.currentTime < 0) {
        return true; // not run yet
      }

      // Invoke known finish handler manually, as this should happen
      // synchronously with the seek. The finish state causes an async call,
      // which is fine for the timeline normally, just not here.
      p.onfinish();
      return false;
    });
  },

  /**
   * Schedule an animation on this FauxTimeline.
   *
   * @param {number} when to start the animation, may be in the past
   * @param {!Element} el to animate
   * @param {!Array.<!Object>} steps of the animation
   * @param {number} duration to run for
   * @return {AnimationPlayer}
   */
  schedule: function(when, el, steps, duration) {
    var now = this.currentTime;
    var player = this.buildPlayer_(el, steps, duration);

    player.playbackRate = this.anim_.playbackRate;
    player.currentTime = now - when;
    this.players_.push(player);
    return player;
  },

  /**
   * Call a function in the future.
   *
   * @param {number} when to call, must be past currentTime
   * @param {function} fn to invoke
   */
  call: function(when, fn) {
    var now = this.currentTime;
    if (when < now) {
      throw new Error('FauxTimeline doesn\'t support calls in past: ' + (now - when));
    }

    var player = this.schedule(when, document.body, [], 0);
    player.onfinish = function() {
      // Check for racey finish being triggered twice. This handler was already
      // cleared so just ignore this call.
      if (player.onfinish === null) { return; }

      // Run and clear this call plus its finish handler.
      this.remove(player);
      player.onfinish = null;
      fn();
    }.bind(this);

    this.calls_.push(player);
  },

  /**
   * Removes a previously registered animation via its AnimationPlayer.
   *
   * @param {AnimationPlayer=} opt_player to remove, undefined for all
   */
  remove: function(opt_player) {
    if (opt_player === undefined) {
      this.players_.forEach(function(player) {
        player.cancel();
      });
      this.players_ = [];
      this.calls_ = [];
      return;
    }

    if (!('cancel' in opt_player)) {
      throw new Error('FauxTimeline remove expects AnimationPlayer, was: ' + opt_player);
    }
    opt_player.cancel();

    var index = this.players_.indexOf(opt_player);
    if (index > -1) {
      this.players_.splice(index, 1);
    }
    index = this.calls_.indexOf(opt_player);
    if (index > -1) {
      this.calls_.splice(index, 1);
    }
  }

};