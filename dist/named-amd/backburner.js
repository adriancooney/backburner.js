define('backburner', ['exports'], function (exports) { 'use strict';

    var SET_TIMEOUT = setTimeout;
    var NOOP = function () { };
    function buildPlatform(flush) {
        var next;
        var clearNext = NOOP;
        if (typeof MutationObserver === 'function') {
            var iterations = 0;
            var observer = new MutationObserver(flush);
            var node = document.createTextNode('');
            observer.observe(node, { characterData: true });
            next = function () {
                iterations = ++iterations % 2;
                node.data = '' + iterations;
                return iterations;
            };
        }
        else if (typeof Promise === 'function') {
            var autorunPromise = Promise.resolve();
            next = function () { return autorunPromise.then(flush); };
        }
        else {
            next = function () { return SET_TIMEOUT(flush, 0); };
        }
        return {
            setTimeout: function setTimeout(fn, ms) {
                return SET_TIMEOUT(fn, ms);
            },
            clearTimeout: function clearTimeout$1(timerId) {
                return clearTimeout(timerId);
            },
            now: function now() {
                return Date.now();
            },
            next: next,
            clearNext: clearNext,
        };
    }

    var NUMBER = /\d+/;
    function isCoercableNumber(suspect) {
        var type = typeof suspect;
        return type === 'number' && suspect === suspect || type === 'string' && NUMBER.test(suspect);
    }
    function getOnError(options) {
        return options.onError || (options.onErrorTarget && options.onErrorTarget[options.onErrorMethod]);
    }
    function findItem(target, method, collection) {
        var index = -1;
        for (var i = 0, l = collection.length; i < l; i += 4) {
            if (collection[i] === target && collection[i + 1] === method) {
                index = i;
                break;
            }
        }
        return index;
    }
    function findTimer(timer, collection) {
        var index = -1;
        for (var i = 3; i < collection.length; i += 4) {
            if (collection[i] === timer) {
                index = i - 3;
                break;
            }
        }
        return index;
    }

    function binarySearch(time, timers) {
        var start = 0;
        var end = timers.length - 6;
        var middle;
        var l;
        while (start < end) {
            // since timers is an array of pairs 'l' will always
            // be an integer
            l = (end - start) / 6;
            // compensate for the index in case even number
            // of pairs inside timers
            middle = start + l - (l % 6);
            if (time >= timers[middle]) {
                start = middle + 6;
            }
            else {
                end = middle;
            }
        }
        return (time >= timers[start]) ? start + 6 : start;
    }

    var Queue = function Queue(name, options, globalOptions) {
        if ( options === void 0 ) options = {};
        if ( globalOptions === void 0 ) globalOptions = {};

        this._queueBeingFlushed = [];
        this.targetQueues = new Map();
        this.index = 0;
        this._queue = [];
        this.name = name;
        this.options = options;
        this.globalOptions = globalOptions;
    };
    Queue.prototype.stackFor = function stackFor (index) {
        if (index < this._queue.length) {
            var entry = this._queue[index * 3 + 4];
            if (entry) {
                return entry.stack;
            }
            else {
                return null;
            }
        }
    };
    Queue.prototype.flush = function flush (sync) {
            var this$1 = this;

        var ref = this.options;
            var before = ref.before;
            var after = ref.after;
        var target;
        var method;
        var args;
        var errorRecordedForStack;
        this.targetQueues.clear();
        if (this._queueBeingFlushed.length === 0) {
            this._queueBeingFlushed = this._queue;
            this._queue = [];
        }
        if (before !== undefined) {
            before();
        }
        var invoke;
        var queueItems = this._queueBeingFlushed;
        if (queueItems.length > 0) {
            var onError = getOnError(this.globalOptions);
            invoke = onError ? this.invokeWithOnError : this.invoke;
            for (var i = this.index; i < queueItems.length; i += 4) {
                this$1.index += 4;
                method = queueItems[i + 1];
                // method could have been nullified / canceled during flush
                if (method !== null) {
                    //
                    //** Attention intrepid developer **
                    //
                    //To find out the stack of this task when it was scheduled onto
                    //the run loop, add the following to your app.js:
                    //
                    //Ember.run.backburner.DEBUG = true; // NOTE: This slows your app, don't leave it on in production.
                    //
                    //Once that is in place, when you are at a breakpoint and navigate
                    //here in the stack explorer, you can look at `errorRecordedForStack.stack`,
                    //which will be the captured stack when this job was scheduled.
                    //
                    //One possible long-term solution is the following Chrome issue:
                    //   https://bugs.chromium.org/p/chromium/issues/detail?id=332624
                    //
                    target = queueItems[i];
                    args = queueItems[i + 2];
                    errorRecordedForStack = queueItems[i + 3]; // Debugging assistance
                    invoke(target, method, args, onError, errorRecordedForStack);
                }
                if (this$1.index !== this$1._queueBeingFlushed.length &&
                    this$1.globalOptions.mustYield && this$1.globalOptions.mustYield()) {
                    return 1 /* Pause */;
                }
            }
        }
        if (after !== undefined) {
            after();
        }
        this._queueBeingFlushed.length = 0;
        this.index = 0;
        if (sync !== false && this._queue.length > 0) {
            // check if new items have been added
            this.flush(true);
        }
    };
    Queue.prototype.hasWork = function hasWork () {
        return this._queueBeingFlushed.length > 0 || this._queue.length > 0;
    };
    Queue.prototype.cancel = function cancel (ref) {
            var target = ref.target;
            var method = ref.method;

        var queue = this._queue;
        var targetQueueMap = this.targetQueues.get(target);
        if (targetQueueMap !== undefined) {
            targetQueueMap.delete(method);
        }
        var index = findItem(target, method, queue);
        if (index > -1) {
            queue.splice(index, 4);
            return true;
        }
        // if not found in current queue
        // could be in the queue that is being flushed
        queue = this._queueBeingFlushed;
        index = findItem(target, method, queue);
        if (index > -1) {
            queue[index + 1] = null;
            return true;
        }
        return false;
    };
    Queue.prototype.push = function push (target, method, args, stack) {
        this._queue.push(target, method, args, stack);
        return {
            queue: this,
            target: target,
            method: method
        };
    };
    Queue.prototype.pushUnique = function pushUnique (target, method, args, stack) {
        var localQueueMap = this.targetQueues.get(target);
        if (localQueueMap === undefined) {
            localQueueMap = new Map();
            this.targetQueues.set(target, localQueueMap);
        }
        var index = localQueueMap.get(method);
        if (index === undefined) {
            var queueIndex = this._queue.push(target, method, args, stack) - 4;
            localQueueMap.set(method, queueIndex);
        }
        else {
            var queue = this._queue;
            queue[index + 2] = args; // replace args
            queue[index + 3] = stack; // replace stack
        }
        return {
            queue: this,
            target: target,
            method: method
        };
    };
    Queue.prototype.invoke = function invoke (target, method, args /*, onError, errorRecordedForStack */) {
        if (args === undefined) {
            method.call(target);
        }
        else {
            method.apply(target, args);
        }
    };
    Queue.prototype.invokeWithOnError = function invokeWithOnError (target, method, args, onError, errorRecordedForStack) {
        try {
            if (args === undefined) {
                method.call(target);
            }
            else {
                method.apply(target, args);
            }
        }
        catch (error) {
            onError(error, errorRecordedForStack);
        }
    };

    var DeferredActionQueues = function DeferredActionQueues(queueNames, options) {
        if ( queueNames === void 0 ) queueNames = [];

        this.queues = {};
        this.queueNameIndex = 0;
        this.queueNames = queueNames;
        queueNames.reduce(function (queues, queueName) {
            queues[queueName] = new Queue(queueName, options[queueName], options);
            return queues;
        }, this.queues);
    };
    /*
      @method schedule
      @param {String} queueName
      @param {Any} target
      @param {Any} method
      @param {Any} args
      @param {Boolean} onceFlag
      @param {Any} stack
      @return queue
    */
    DeferredActionQueues.prototype.schedule = function schedule (queueName, target, method, args, onceFlag, stack) {
        var queues = this.queues;
        var queue = queues[queueName];
        if (queue === undefined) {
            throw new Error(("You attempted to schedule an action in a queue (" + queueName + ") that doesn't exist"));
        }
        if (method === undefined || method === null) {
            throw new Error(("You attempted to schedule an action in a queue (" + queueName + ") for a method that doesn't exist"));
        }
        this.queueNameIndex = 0;
        if (onceFlag) {
            return queue.pushUnique(target, method, args, stack);
        }
        else {
            return queue.push(target, method, args, stack);
        }
    };
    /*
      @method flush
      DeferredActionQueues.flush() calls Queue.flush()
    */
    DeferredActionQueues.prototype.flush = function flush (fromAutorun) {
            var this$1 = this;
            if ( fromAutorun === void 0 ) fromAutorun = false;

        var queue;
        var queueName;
        var numberOfQueues = this.queueNames.length;
        while (this.queueNameIndex < numberOfQueues) {
            queueName = this$1.queueNames[this$1.queueNameIndex];
            queue = this$1.queues[queueName];
            if (queue.hasWork() === false) {
                this$1.queueNameIndex++;
                if (fromAutorun && this$1.queueNameIndex < numberOfQueues) {
                    return 1 /* Pause */;
                }
            }
            else {
                if (queue.flush(false /* async */) === 1 /* Pause */) {
                    return 1 /* Pause */;
                }
            }
        }
    };

    function iteratorDrain (fn) {
        var iterator = fn();
        var result = iterator.next();
        while (result.done === false) {
            result.value();
            result = iterator.next();
        }
    }

    var noop = function () { };
    function parseArgs() {
        var arguments$1 = arguments;

        var length = arguments.length;
        var args;
        var method;
        var target;
        if (length === 0) {
        }
        else if (length === 1) {
            target = null;
            method = arguments[0];
        }
        else {
            var argsIndex = 2;
            var methodOrTarget = arguments[0];
            var methodOrArgs = arguments[1];
            var type = typeof methodOrArgs;
            if (type === 'function') {
                target = methodOrTarget;
                method = methodOrArgs;
            }
            else if (methodOrTarget !== null && type === 'string' && methodOrArgs in methodOrTarget) {
                target = methodOrTarget;
                method = target[methodOrArgs];
            }
            else if (typeof methodOrTarget === 'function') {
                argsIndex = 1;
                target = null;
                method = methodOrTarget;
            }
            if (length > argsIndex) {
                var len = length - argsIndex;
                args = new Array(len);
                for (var i = 0; i < len; i++) {
                    args[i] = arguments$1[i + argsIndex];
                }
            }
        }
        return [target, method, args];
    }
    function parseTimerArgs() {
        var ref = parseArgs.apply(void 0, arguments);
        var target = ref[0];
        var method = ref[1];
        var args = ref[2];
        var wait = 0;
        var length = args !== undefined ? args.length : 0;
        if (length > 0) {
            var last = args[length - 1];
            if (isCoercableNumber(last)) {
                wait = parseInt(args.pop(), 10);
            }
        }
        return [target, method, args, wait];
    }
    function parseDebounceArgs() {
        var assign;

        var target;
        var method;
        var isImmediate;
        var args;
        var wait;
        if (arguments.length === 2) {
            method = arguments[0];
            wait = arguments[1];
            target = null;
        }
        else {
            (assign = parseArgs.apply(void 0, arguments), target = assign[0], method = assign[1], args = assign[2]);
            if (args === undefined) {
                wait = 0;
            }
            else {
                wait = args.pop();
                if (!isCoercableNumber(wait)) {
                    isImmediate = wait === true;
                    wait = args.pop();
                }
            }
        }
        wait = parseInt(wait, 10);
        return [target, method, args, wait, isImmediate];
    }
    var UUID = 0;
    var beginCount = 0;
    var endCount = 0;
    var beginEventCount = 0;
    var endEventCount = 0;
    var runCount = 0;
    var joinCount = 0;
    var deferCount = 0;
    var scheduleCount = 0;
    var scheduleIterableCount = 0;
    var deferOnceCount = 0;
    var scheduleOnceCount = 0;
    var setTimeoutCount = 0;
    var laterCount = 0;
    var throttleCount = 0;
    var debounceCount = 0;
    var cancelTimersCount = 0;
    var cancelCount = 0;
    var autorunsCreatedCount = 0;
    var autorunsCompletedCount = 0;
    var deferredActionQueuesCreatedCount = 0;
    var nestedDeferredActionQueuesCreated = 0;
    var Backburner = function Backburner(queueNames, options) {
          var this$1 = this;

          this.DEBUG = false;
          this.currentInstance = null;
          this.instanceStack = [];
          this._debouncees = [];
          this._throttlers = [];
          this._eventCallbacks = {
              end: [],
              begin: []
          };
          this._timerTimeoutId = null;
          this._timers = [];
          this._autorun = null;
          this.queueNames = queueNames;
          this.options = options || {};
          if (typeof this.options.defaultQueue === 'string') {
              this._defaultQueue = this.options.defaultQueue;
          }
          else {
              this._defaultQueue = this.queueNames[0];
          }
          this._onBegin = this.options.onBegin || noop;
          this._onEnd = this.options.onEnd || noop;
          this._boundRunExpiredTimers = this._runExpiredTimers.bind(this);
          this._boundAutorunEnd = function () {
              autorunsCompletedCount++;
              // if the autorun was already flushed, do nothing
              if (this$1._autorun === null) {
                  return;
              }
              this$1._autorun = null;
              this$1._end(true /* fromAutorun */);
          };
          var builder = this.options._buildPlatform || buildPlatform;
          this._platform = builder(this._boundAutorunEnd);
      };

    var prototypeAccessors = { counters: { configurable: true },defaultQueue: { configurable: true } };
      prototypeAccessors.counters.get = function () {
          return {
              begin: beginCount,
              end: endCount,
              events: {
                  begin: beginEventCount,
                  end: endEventCount,
              },
              autoruns: {
                  created: autorunsCreatedCount,
                  completed: autorunsCompletedCount,
              },
              run: runCount,
              join: joinCount,
              defer: deferCount,
              schedule: scheduleCount,
              scheduleIterable: scheduleIterableCount,
              deferOnce: deferOnceCount,
              scheduleOnce: scheduleOnceCount,
              setTimeout: setTimeoutCount,
              later: laterCount,
              throttle: throttleCount,
              debounce: debounceCount,
              cancelTimers: cancelTimersCount,
              cancel: cancelCount,
              loops: {
                  total: deferredActionQueuesCreatedCount,
                  nested: nestedDeferredActionQueuesCreated,
              },
          };
      };
      prototypeAccessors.defaultQueue.get = function () {
          return this._defaultQueue;
      };
      /*
        @method begin
        @return instantiated class DeferredActionQueues
      */
      Backburner.prototype.begin = function begin () {
          beginCount++;
          var options = this.options;
          var previousInstance = this.currentInstance;
          var current;
          if (this._autorun !== null) {
              current = previousInstance;
              this._cancelAutorun();
          }
          else {
              if (previousInstance !== null) {
                  nestedDeferredActionQueuesCreated++;
                  this.instanceStack.push(previousInstance);
              }
              deferredActionQueuesCreatedCount++;
              current = this.currentInstance = new DeferredActionQueues(this.queueNames, options);
              beginEventCount++;
              this._trigger('begin', current, previousInstance);
          }
          this._onBegin(current, previousInstance);
          return current;
      };
      Backburner.prototype.end = function end () {
          endCount++;
          this._end(false);
      };
      Backburner.prototype.on = function on (eventName, callback) {
          if (typeof callback !== 'function') {
              throw new TypeError("Callback must be a function");
          }
          var callbacks = this._eventCallbacks[eventName];
          if (callbacks !== undefined) {
              callbacks.push(callback);
          }
          else {
              throw new TypeError(("Cannot on() event " + eventName + " because it does not exist"));
          }
      };
      Backburner.prototype.off = function off (eventName, callback) {
          var callbacks = this._eventCallbacks[eventName];
          if (!eventName || callbacks === undefined) {
              throw new TypeError(("Cannot off() event " + eventName + " because it does not exist"));
          }
          var callbackFound = false;
          if (callback) {
              for (var i = 0; i < callbacks.length; i++) {
                  if (callbacks[i] === callback) {
                      callbackFound = true;
                      callbacks.splice(i, 1);
                      i--;
                  }
              }
          }
          if (!callbackFound) {
              throw new TypeError("Cannot off() callback that does not exist");
          }
      };
      Backburner.prototype.run = function run () {
          runCount++;
          var ref = parseArgs.apply(void 0, arguments);
            var target = ref[0];
            var method = ref[1];
            var args = ref[2];
          return this._run(target, method, args);
      };
      Backburner.prototype.join = function join () {
          joinCount++;
          var ref = parseArgs.apply(void 0, arguments);
            var target = ref[0];
            var method = ref[1];
            var args = ref[2];
          return this._join(target, method, args);
      };
      /**
       * @deprecated please use schedule instead.
       */
      Backburner.prototype.defer = function defer (queueName, target, method) {
            var ref;

            var args = [], len = arguments.length - 3;
            while ( len-- > 0 ) args[ len ] = arguments[ len + 3 ];
          deferCount++;
          return (ref = this).schedule.apply(ref, [ queueName, target, method ].concat( args ));
      };
      Backburner.prototype.schedule = function schedule (queueName) {
            var _args = [], len = arguments.length - 1;
            while ( len-- > 0 ) _args[ len ] = arguments[ len + 1 ];

          scheduleCount++;
          var ref = parseArgs.apply(void 0, _args);
            var target = ref[0];
            var method = ref[1];
            var args = ref[2];
          if (this.DEBUG) {
              var stackError = new Error();
              return this._ensureInstance().schedule(queueName, null, this._asyncExecute(target, method, args, stackError), null, false, stackError);
          }
          else {
              return this._ensureInstance().schedule(queueName, target, method, args, false, undefined);
          }
      };
      /*
        Defer the passed iterable of functions to run inside the specified queue.
      
        @method scheduleIterable
        @param {String} queueName
        @param {Iterable} an iterable of functions to execute
        @return method result
      */
      Backburner.prototype.scheduleIterable = function scheduleIterable (queueName, iterable) {
          scheduleIterableCount++;
          var stack = this.DEBUG ? new Error() : undefined;
          return this._ensureInstance().schedule(queueName, null, iteratorDrain, [iterable], false, stack);
      };
      /**
       * @deprecated please use scheduleOnce instead.
       */
      Backburner.prototype.deferOnce = function deferOnce (queueName, target, method) {
            var ref;

            var args = [], len = arguments.length - 3;
            while ( len-- > 0 ) args[ len ] = arguments[ len + 3 ];
          deferOnceCount++;
          return (ref = this).scheduleOnce.apply(ref, [ queueName, target, method ].concat( args ));
      };
      Backburner.prototype.scheduleOnce = function scheduleOnce (queueName) {
            var _args = [], len = arguments.length - 1;
            while ( len-- > 0 ) _args[ len ] = arguments[ len + 1 ];

          scheduleOnceCount++;
          var ref = parseArgs.apply(void 0, _args);
            var target = ref[0];
            var method = ref[1];
            var args = ref[2];
          var stack = this.DEBUG ? new Error() : undefined;
          return this._ensureInstance().schedule(queueName, target, method, args, true, stack);
      };
      Backburner.prototype.setTimeout = function setTimeout () {
            var ref;

          setTimeoutCount++;
          return (ref = this).later.apply(ref, arguments);
      };
      Backburner.prototype.later = function later () {
          laterCount++;
          var ref = parseTimerArgs.apply(void 0, arguments);
            var target = ref[0];
            var method = ref[1];
            var args = ref[2];
            var wait = ref[3];
          if (this.DEBUG) {
              return this._later(null, this._asyncExecute(target, method, args, new Error()), null, wait);
          }
          else {
              return this._later(target, method, args, wait);
          }
      };
      Backburner.prototype.throttle = function throttle () {
            var this$1 = this;

          throttleCount++;
          var ref = parseDebounceArgs.apply(void 0, arguments);
            var target = ref[0];
            var method = ref[1];
            var args = ref[2];
            var wait = ref[3];
            var isImmediate = ref[4]; if ( isImmediate === void 0 ) isImmediate = true;
          var index = findItem(target, method, this._throttlers);
          if (index > -1) {
              this._throttlers[index + 2] = args;
              return this._throttlers[index + 3];
          } // throttled
          var timer = this._platform.setTimeout(function () {
              var i = findTimer(timer, this$1._throttlers);
              var ref = this$1._throttlers.splice(i, 4);
                var context = ref[0];
                var func = ref[1];
                var params = ref[2];
              if (isImmediate === false) {
                  this$1._run(context, func, params);
              }
          }, wait);
          if (isImmediate) {
              this._join(target, method, args);
          }
          this._throttlers.push(target, method, args, timer);
          return timer;
      };
      Backburner.prototype.debounce = function debounce () {
            var this$1 = this;

          debounceCount++;
          var ref = parseDebounceArgs.apply(void 0, arguments);
            var target = ref[0];
            var method = ref[1];
            var args = ref[2];
            var wait = ref[3];
            var isImmediate = ref[4]; if ( isImmediate === void 0 ) isImmediate = false;
          // Remove debouncee
          var index = findItem(target, method, this._debouncees);
          if (index > -1) {
              var timerId = this._debouncees[index + 3];
              this._platform.clearTimeout(timerId);
              this._debouncees.splice(index, 4);
          }
          var timer = this._platform.setTimeout(function () {
              var i = findTimer(timer, this$1._debouncees);
              var ref = this$1._debouncees.splice(i, 4);
                var context = ref[0];
                var func = ref[1];
                var params = ref[2];
              if (isImmediate === false) {
                  this$1._run(context, func, params);
              }
          }, wait);
          if (isImmediate && index === -1) {
              this._join(target, method, args);
          }
          this._debouncees.push(target, method, args, timer);
          return timer;
      };
      Backburner.prototype.cancelTimers = function cancelTimers () {
            var this$1 = this;

          cancelTimersCount++;
          for (var i = 3; i < this._throttlers.length; i += 4) {
              this$1._platform.clearTimeout(this$1._throttlers[i]);
          }
          this._throttlers = [];
          for (var t = 3; t < this._debouncees.length; t += 4) {
              this$1._platform.clearTimeout(this$1._debouncees[t]);
          }
          this._debouncees = [];
          this._clearTimerTimeout();
          this._timers = [];
          this._cancelAutorun();
      };
      Backburner.prototype.hasTimers = function hasTimers () {
          return this._timers.length > 0 ||
              this._debouncees.length > 0 ||
              this._throttlers.length > 0 ||
              this._autorun !== null;
      };
      Backburner.prototype.cancel = function cancel (timer) {
          cancelCount++;
          if (timer === undefined || timer === null) {
              return false;
          }
          var timerType = typeof timer;
          if (timerType === 'number') {
              return this._cancelItem(timer, this._throttlers) || this._cancelItem(timer, this._debouncees);
          }
          else if (timerType === 'string') {
              return this._cancelLaterTimer(timer);
          }
          else if (timerType === 'object' && timer.queue && timer.method) {
              return timer.queue.cancel(timer);
          }
          return false;
      };
      Backburner.prototype.ensureInstance = function ensureInstance () {
          this._ensureInstance();
      };
      Backburner.prototype._end = function _end (fromAutorun) {
          var currentInstance = this.currentInstance;
          var nextInstance = null;
          if (currentInstance === null) {
              throw new Error("end called without begin");
          }
          // Prevent double-finally bug in Safari 6.0.2 and iOS 6
          // This bug appears to be resolved in Safari 6.0.5 and iOS 7
          var finallyAlreadyCalled = false;
          var result;
          try {
              result = currentInstance.flush(fromAutorun);
          }
          finally {
              if (!finallyAlreadyCalled) {
                  finallyAlreadyCalled = true;
                  if (result === 1 /* Pause */) {
                      this._scheduleAutorun();
                  }
                  else {
                      this.currentInstance = null;
                      if (this.instanceStack.length > 0) {
                          nextInstance = this.instanceStack.pop();
                          this.currentInstance = nextInstance;
                      }
                      this._trigger('end', currentInstance, nextInstance);
                      this._onEnd(currentInstance, nextInstance);
                  }
              }
          }
      };
      Backburner.prototype._join = function _join (target, method, args) {
          if (this.currentInstance === null) {
              return this._run(target, method, args);
          }
          if (target === undefined && args === undefined) {
              return method();
          }
          else {
              return method.apply(target, args);
          }
      };
      Backburner.prototype._run = function _run (target, method, args) {
          var onError = getOnError(this.options);
          this.begin();
          if (onError) {
              try {
                  return method.apply(target, args);
              }
              catch (error) {
                  onError(error);
              }
              finally {
                  this.end();
              }
          }
          else {
              try {
                  return method.apply(target, args);
              }
              finally {
                  this.end();
              }
          }
      };
      Backburner.prototype._cancelAutorun = function _cancelAutorun () {
          if (this._autorun !== null) {
              this._platform.clearNext(this._autorun);
              this._autorun = null;
          }
      };
      Backburner.prototype._later = function _later (target, method, args, wait) {
          var stack = this.DEBUG ? new Error() : undefined;
          var executeAt = this._platform.now() + wait;
          var id = (UUID++) + '';
          if (this._timers.length === 0) {
              this._timers.push(executeAt, id, target, method, args, stack);
              this._installTimerTimeout();
          }
          else {
              // find position to insert
              var i = binarySearch(executeAt, this._timers);
              this._timers.splice(i, 0, executeAt, id, target, method, args, stack);
              // we should be the new earliest timer if i == 0
              if (i === 0) {
                  this._reinstallTimerTimeout();
              }
          }
          return id;
      };
      Backburner.prototype._cancelLaterTimer = function _cancelLaterTimer (timer) {
            var this$1 = this;

          for (var i = 1; i < this._timers.length; i += 6) {
              if (this$1._timers[i] === timer) {
                  i = i - 1;
                  this$1._timers.splice(i, 6);
                  if (i === 0) {
                      this$1._reinstallTimerTimeout();
                  }
                  return true;
              }
          }
          return false;
      };
      Backburner.prototype._cancelItem = function _cancelItem (timer, array) {
          var index = findTimer(timer, array);
          if (index > -1) {
              this._platform.clearTimeout(timer);
              array.splice(index, 4);
              return true;
          }
          return false;
      };
      /**
       Trigger an event. Supports up to two arguments. Designed around
       triggering transition events from one run loop instance to the
       next, which requires an argument for theinstance and then
       an argument for the next instance.
      
       @private
       @method _trigger
       @param {String} eventName
       @param {any} arg1
       @param {any} arg2
       */
      Backburner.prototype._trigger = function _trigger (eventName, arg1, arg2) {
          var callbacks = this._eventCallbacks[eventName];
          if (callbacks !== undefined) {
              for (var i = 0; i < callbacks.length; i++) {
                  callbacks[i](arg1, arg2);
              }
          }
      };
      Backburner.prototype._runExpiredTimers = function _runExpiredTimers () {
          this._timerTimeoutId = null;
          if (this._timers.length > 0) {
              this.begin();
              this._scheduleExpiredTimers();
              this.end();
          }
      };
      Backburner.prototype._scheduleExpiredTimers = function _scheduleExpiredTimers () {
            var this$1 = this;

          var timers = this._timers;
          var i = 0;
          var l = timers.length;
          var defaultQueue = this._defaultQueue;
          var n = this._platform.now();
          for (; i < l; i += 6) {
              var executeAt = timers[i];
              if (executeAt > n) {
                  break;
              }
              var target = timers[i + 2];
              var method = timers[i + 3];
              var args = timers[i + 4];
              var stack = timers[i + 5];
              this$1.currentInstance.schedule(defaultQueue, target, method, args, false, stack);
          }
          timers.splice(0, i);
          this._installTimerTimeout();
      };
      Backburner.prototype._reinstallTimerTimeout = function _reinstallTimerTimeout () {
          this._clearTimerTimeout();
          this._installTimerTimeout();
      };
      Backburner.prototype._clearTimerTimeout = function _clearTimerTimeout () {
          if (this._timerTimeoutId === null) {
              return;
          }
          this._platform.clearTimeout(this._timerTimeoutId);
          this._timerTimeoutId = null;
      };
      Backburner.prototype._installTimerTimeout = function _installTimerTimeout () {
          if (this._timers.length === 0) {
              return;
          }
          var minExpiresAt = this._timers[0];
          var n = this._platform.now();
          var wait = Math.max(0, minExpiresAt - n);
          this._timerTimeoutId = this._platform.setTimeout(this._boundRunExpiredTimers, wait);
      };
      Backburner.prototype._asyncExecute = function _asyncExecute (target, method, args, stackError) {
            var this$1 = this;

          var resolve;
          new Promise(function (_resolve) { return resolve = _resolve; })
              .then(method.bind.apply(method, [ target ].concat( args )))
              .catch(function (err) {
              var onError = getOnError(this$1.options);
              if (onError) {
                  onError.call(null, err, stackError);
              }
          });
          return resolve;
      };
      Backburner.prototype._ensureInstance = function _ensureInstance () {
          var currentInstance = this.currentInstance;
          if (currentInstance === null) {
              currentInstance = this.begin();
              this._scheduleAutorun();
          }
          return currentInstance;
      };
      Backburner.prototype._scheduleAutorun = function _scheduleAutorun () {
          autorunsCreatedCount++;
          var next = this._platform.next;
          this._autorun = next();
      };

    Object.defineProperties( Backburner.prototype, prototypeAccessors );
    Backburner.Queue = Queue;

    exports.default = Backburner;
    exports.buildPlatform = buildPlatform;

    Object.defineProperty(exports, '__esModule', { value: true });

});
