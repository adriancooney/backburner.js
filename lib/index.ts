import {
  each,
  findDebouncee,
  findItem,
  findThrottler,
  getOnError,
  isCoercableNumber,
  isFunction,
  isNumber,
  isString,
  now
} from './backburner/utils';

import searchTimer from './backburner/binary-search';
import DeferredActionQueues from './backburner/deferred-action-queues';
import iteratorDrain from './backburner/iterator-drain';

import Queue, { QUEUE_STATE } from './backburner/queue';

export default class Backburner {
  public static Queue = Queue;

  public DEBUG = false;

  public currentInstance: DeferredActionQueues | null | undefined;

  public options: any;

  private queueNames: string[];
  private instanceStack: DeferredActionQueues[];
  private _debouncees: any[];
  private _throttlers: any[];
  private _eventCallbacks: {
    end: Function[];
    begin: Function[];
  };

  private _boundClearItems: (item) => void;
  private _timerTimeoutId: number | undefined;
  private _timers: any[];
  private _platform: {
    setTimeout(fn: () => void, ms: number): number;
    clearTimeout(id: number): void;
    next(fn: () => void): number;
    clearNext(fn): void;
  };

  private _boundRunExpiredTimers: () => void;

  private _autorun: number | null = null;
  private _boundAutorunEnd: () => void;

  constructor(queueNames: string[], options: any = {} ) {
    this.queueNames = queueNames;
    this.options = options;
    if (!this.options.defaultQueue) {
      this.options.defaultQueue = queueNames[0];
    }
    this.currentInstance = null;
    this.instanceStack = [];
    this._debouncees = [];
    this._throttlers = [];
    this._eventCallbacks = {
      end: [],
      begin: []
    };

    this._boundClearItems = (item) => {
      this._platform.clearTimeout(item[2]);
    };

    this._timerTimeoutId = undefined;
    this._timers = [];

    this._platform = this.options._platform || {
      setTimeout(fn, ms) {
        return setTimeout(fn, ms);
      },
      clearTimeout(id) {
        clearTimeout(id);
      },
      next(fn) {
        // TODO: asap
        return setTimeout(fn, 0);
      },
      clearNext(fn) {
        clearTimeout(fn);
      }
    };

    this._boundRunExpiredTimers = () => {
      this._runExpiredTimers();
    };

    this._boundAutorunEnd = () => {
      this._autorun = null;
      this.end();
    };
  }

  /*
    @method begin
    @return instantiated class DeferredActionQueues
  */
  public begin(): DeferredActionQueues {
    let options = this.options;
    let { onBegin } = options;
    let previousInstance = this.currentInstance;
    let current;

    if (this._autorun !== null) {
      current = previousInstance;
      this._cancelAutorun();
    } else {
      if (previousInstance) {
        this.instanceStack.push(previousInstance);
      }
      current = this.currentInstance = new DeferredActionQueues(this.queueNames, options);
      this._trigger('begin', current, previousInstance);
    }

    if (onBegin) {
      onBegin(current, previousInstance);
    }

    return current;
  }

  public end() {
    let { onEnd } = this.options;
    let currentInstance = this.currentInstance;
    let nextInstance: DeferredActionQueues | null | undefined = null;

    if (!currentInstance) {
      throw new Error(`end called without begin`);
    }

    // Prevent double-finally bug in Safari 6.0.2 and iOS 6
    // This bug appears to be resolved in Safari 6.0.5 and iOS 7
    let finallyAlreadyCalled = false;
    let result;
    try {
      result = currentInstance.flush();
    } finally {
      if (!finallyAlreadyCalled) {
        finallyAlreadyCalled = true;

        if (result === QUEUE_STATE.Pause) {
          const next = this._platform.next;
          this._autorun = next(this._boundAutorunEnd);
        } else {
          this.currentInstance = null;

          if (this.instanceStack.length > 0) {
            nextInstance = this.instanceStack.pop();
            this.currentInstance = nextInstance;
          }
          this._trigger('end', currentInstance, nextInstance);
          if (onEnd) {
            onEnd(currentInstance, nextInstance);
          }
        }
      }
    }
  }

  public on(eventName, callback) {
    if (typeof callback !== 'function') {
      throw new TypeError(`Callback must be a function`);
    }
    let callbacks = this._eventCallbacks[eventName];
    if (callbacks !== undefined) {
      callbacks.push(callback);
    } else {
      throw new TypeError(`Cannot on() event ${eventName} because it does not exist`);
    }
  }

  public off(eventName, callback) {
    if (eventName) {
      let callbacks = this._eventCallbacks[eventName];
      let callbackFound = false;
      if (callbacks === undefined) {
        return;
      }
      if (callback) {
        for (let i = 0; i < callbacks.length; i++) {
          if (callbacks[i] === callback) {
            callbackFound = true;
            callbacks.splice(i, 1);
            i--;
          }
        }
      }
      if (!callbackFound) {
        throw new TypeError(`Cannot off() callback that does not exist`);
      }
    } else {
      throw new TypeError(`Cannot off() event ${eventName} because it does not exist`);
    }
  }

  public run(method: Function);
  public run(target: Function | any | null, method?: Function | string, ...args);
  public run(target: any | null | undefined, method?: any, ...args: any[]) {
    let length = arguments.length;
    let _method: Function | string;
    let _target: any | null | undefined;

    if (length === 1) {
      _method = target;
      _target = null;
    } else {
      _method = method;
      _target = target;
    }

    if (isString(_method)) {
      _method = <Function> _target[_method];
    }

    let onError = getOnError(this.options);

    this.begin();

    if (onError) {
      try {
        return _method.apply(_target, args);
      } catch (error) {
        onError(error);
      } finally {
        this.end();
      }
    } else {
      try {
        return _method.apply(_target, args);
      } finally {
        this.end();
      }
    }
  }

  /*
    Join the passed method with an existing queue and execute immediately,
    if there isn't one use `Backburner#run`.

    The join method is like the run method except that it will schedule into
    an existing queue if one already exists. In either case, the join method will
    immediately execute the passed in function and return its result.

    @method join
    @param {Object} target
    @param {Function} method The method to be executed
    @param {any} args The method arguments
    @return method result
  */
  public join(...args);
  public join() {
    if (this.currentInstance === null || this.currentInstance === undefined) {
      return this.run.apply(this, arguments);
    }

    let length = arguments.length;
    let method;
    let target;

    if (length === 1) {
      method = arguments[0];
      target = null;
    } else {
      target = arguments[0];
      method = arguments[1];
    }

    if (isString(method)) {
      method = target[method];
    }

    if (length === 1) {
      return method();
    } else if (length === 2) {
      return method.call(target);
    } else {
      let args = new Array(length - 2);
      for (let i = 0, l = length - 2; i < l; i++) {
        args[i] = arguments[i + 2];
      }
      return method.apply(target, args);
    }
  }

  /**
   * @deprecated please use schedule instead.
   */
  public defer(queueName: string, ...args);
  public defer() {
    return this.schedule.apply(this, arguments);
  }

  /**
   * Schedule the passed function to run inside the specified queue.
   */
  public schedule(queueName: string, method: Function);
  public schedule<T, U extends keyof T>(queueName: string, target: T, method: U, ...args);
  public schedule(queueName: string, target: any | null, method: any | Function, ...args);
  public schedule(queueName: string) {
    let length = arguments.length;
    let method;
    let target;
    let args;

    if (length === 2) {
      method = arguments[1];
      target = null;
    } else {
      target = arguments[1];
      method = arguments[2];
    }

    if (isString(method)) {
      method = target[method];
    }

    let stack = this.DEBUG ? new Error() : undefined;

    if (length > 3) {
      args = new Array(length - 3);
      for (let i = 3; i < length; i++) {
        args[i - 3] = arguments[i];
      }
    } else {
      args = undefined;
    }
    return this._ensureInstance().schedule(queueName, target, method, args, false, stack);
  }

  /*
    Defer the passed iterable of functions to run inside the specified queue.

    @method scheduleIterable
    @param {String} queueName
    @param {Iterable} an iterable of functions to execute
    @return method result
  */
  public scheduleIterable(queueName: string, iterable: Function) {
    let stack = this.DEBUG ? new Error() : undefined;
    let _iteratorDrain = iteratorDrain;
    return this._ensureInstance().schedule(queueName, null, _iteratorDrain, [iterable], false, stack);
  }

  /**
   * @deprecated please use scheduleOnce instead.
   */
  public deferOnce(queueName: string, ...args);
  public deferOnce() {
    return this.scheduleOnce.apply(this, arguments);
  }

  /**
   * Schedule the passed function to run once inside the specified queue.
   */
  public scheduleOnce(queueName: string, method: Function);
  public scheduleOnce<T, U extends keyof T>(queueName: string, target: T, method: U, ...args);
  public scheduleOnce(queueName: string, target: any | null, method: any | Function, ...args);
  public scheduleOnce(queueName: string /* , target, method, args */) {
    let length = arguments.length;
    let method;
    let target;
    let args;

    if (length === 2) {
      method = arguments[1];
      target = null;
    } else {
      target = arguments[1];
      method = arguments[2];
    }

    if (isString(method)) {
      method = target[method];
    }

    let stack = this.DEBUG ? new Error() : undefined;

    if (length > 3) {
      args = new Array(length - 3);
      for (let i = 3; i < length; i++) {
        args[i - 3] = arguments[i];
      }
    } else {
      args = undefined;
    }

    let currentInstance = this._ensureInstance();
    return currentInstance.schedule(queueName, target, method, args, true, stack);
  }

  /**
   * @deprecated use later instead.
   */
  public setTimeout(...args);
  public setTimeout() {
    return this.later.apply(this, arguments);
  }

  public later(...args);
  public later() {
    let l = arguments.length;
    let args = new Array(l);

    for (let x = 0; x < l; x++) {
      args[x] = arguments[x];
    }

    let length = args.length;
    let method;
    let wait;
    let target;
    let methodOrTarget;
    let methodOrWait;
    let methodOrArgs;

    if (length === 0) {
      return;
    } else if (length === 1) {
      method = args.shift();
      wait = 0;
    } else if (length === 2) {
      methodOrTarget = args[0];
      methodOrWait = args[1];

      if (isFunction(methodOrWait)) {
        target = args.shift();
        method = args.shift();
        wait = 0;
      } else if (isString(methodOrWait) && methodOrTarget !== null && methodOrWait in methodOrTarget) {
        target = args.shift();
        method = target[args.shift()];
        wait = 0;
      } else if (isCoercableNumber(methodOrWait)) {
        method = args.shift();
        wait = args.shift();
      } else {
        method = args.shift();
        wait =  0;
      }
    } else {
      let last = args[args.length - 1];

      if (isCoercableNumber(last)) {
        wait = args.pop();
      } else {
        wait = 0;
      }

      methodOrTarget = args[0];
      methodOrArgs = args[1];

      if (isFunction(methodOrArgs)) {
        target = args.shift();
        method = args.shift();
      } else if (isString(methodOrArgs) && methodOrTarget !== null && methodOrArgs in methodOrTarget) {
        target = args.shift();
        method = target[args.shift()];
      } else {
        method = args.shift();
      }
    }

    let executeAt = now() + parseInt(wait !== wait ? 0 : wait, 10);
    let onError = getOnError(this.options);

    function fn() {
      if (onError) {
        try {
          method.apply(target, args);
        } catch (e) {
          onError(e);
        }
      } else {
        method.apply(target, args);
      }
    }

    return this._setTimeout(fn, executeAt);
  }

  public throttle(...args);
  public throttle(target, method /* , args, wait, [immediate] */) {
    let backburner = this;
    let args = new Array(arguments.length);
    for (let i = 0; i < arguments.length; i++) {
      args[i] = arguments[i];
    }
    let immediate = args.pop();
    let isImmediate;
    let wait;
    let throttler;
    let index;
    let timer;

    if (isNumber(immediate) || isString(immediate)) {
      wait = immediate;
      isImmediate = true;
    } else {
      wait = args.pop();
      isImmediate = immediate === true;
    }

    wait = parseInt(wait, 10);

    index = findThrottler(target, method, this._throttlers);
    if (index > -1) { return this._throttlers[index]; } // throttled

    timer = this._platform.setTimeout(function() {
      if (isImmediate === false) {
        backburner.run.apply(backburner, args);
      }
      index = findThrottler(target, method, backburner._throttlers);
      if (index > -1) {
        backburner._throttlers.splice(index, 1);
      }
    }, wait);

    if (isImmediate) {
      this.join.apply(this, args);
    }

    throttler = [target, method, timer];

    this._throttlers.push(throttler);

    return throttler;
  }

  public debounce(...args);
  public debounce(target, method /* , args, wait, [immediate] */) {
    let backburner = this;
    let args = new Array(arguments.length);
    for (let i = 0; i < arguments.length; i++) {
      args[i] = arguments[i];
    }

    let immediate = args.pop();
    let isImmediate;
    let wait;
    let index;
    let debouncee;
    let timer;

    if (isNumber(immediate) || isString(immediate)) {
      wait = immediate;
      isImmediate = false;
    } else {
      wait = args.pop();
      isImmediate = immediate === true;
    }

    wait = parseInt(wait, 10);
    // Remove debouncee
    index = findDebouncee(target, method, this._debouncees);

    if (index > -1) {
      debouncee = this._debouncees[index];
      this._debouncees.splice(index, 1);
      this._platform.clearTimeout(debouncee[2]);
    }

    timer = this._platform.setTimeout(function() {
      if (isImmediate === false) {
        backburner.run.apply(backburner, args);
      }
      index = findDebouncee(target, method, backburner._debouncees);
      if (index > -1) {
        backburner._debouncees.splice(index, 1);
      }
    }, wait);

    if (isImmediate && index === -1) {
      backburner.run.apply(backburner, args);
    }

    debouncee = [
      target,
      method,
      timer
    ];

    backburner._debouncees.push(debouncee);

    return debouncee;
  }

  public cancelTimers() {
    each(this._throttlers, this._boundClearItems);
    this._throttlers = [];

    each(this._debouncees, this._boundClearItems);
    this._debouncees = [];

    this._clearTimerTimeout();
    this._timers = [];

    if (this._autorun !== null) {
      this._platform.clearNext(this._autorun);
      this._autorun = null;
    }

    this._cancelAutorun();
  }

  public hasTimers() {
    return this._timers.length > 0 || this._debouncees.length > 0 || this._throttlers.length > 0 || this._autorun !== null;
  }

  public cancel(timer?) {
    let timerType = typeof timer;

    if (timer && timerType === 'object' && timer.queue && timer.method) { // we're cancelling a deferOnce
      return timer.queue.cancel(timer);
    } else if (timerType === 'function') { // we're cancelling a setTimeout
      for (let i = 0, l = this._timers.length; i < l; i += 2) {
        if (this._timers[i + 1] === timer) {
          this._timers.splice(i, 2); // remove the two elements
          if (i === 0) {
            this._reinstallTimerTimeout();
          }
          return true;
        }
      }
    } else if (Object.prototype.toString.call(timer) === '[object Array]') { // we're cancelling a throttle or debounce
      return this._cancelItem(findThrottler, this._throttlers, timer) ||
               this._cancelItem(findDebouncee, this._debouncees, timer);
    } else {
      return; // timer was null or not a timer
    }
  }

  private _cancelAutorun() {
    if (this._autorun !== null) {
      this._platform.clearTimeout(this._autorun);
      this._autorun = null;
    }
  }

  private _setTimeout(fn, executeAt) {
    if (this._timers.length === 0) {
      this._timers.push(executeAt, fn);
      this._installTimerTimeout();
      return fn;
    }

    // find position to insert
    let i = searchTimer(executeAt, this._timers);

    this._timers.splice(i, 0, executeAt, fn);

    // we should be the new earliest timer if i == 0
    if (i === 0) {
      this._reinstallTimerTimeout();
    }

    return fn;
  }

  private _cancelItem(findMethod, array, timer) {
    let item;
    let index;

    if (timer.length < 3) { return false; }

    index = findMethod(timer[0], timer[1], array);

    if (index > -1) {

      item = array[index];

      if (item[2] === timer[2]) {
        array.splice(index, 1);
        this._platform.clearTimeout(timer[2]);
        return true;
      }
    }

    return false;
  }

  /**
   Trigger an event. Supports up to two arguments. Designed around
   triggering transition events from one run loop instance to the
   next, which requires an argument for the first instance and then
   an argument for the next instance.

   @private
   @method _trigger
   @param {String} eventName
   @param {any} arg1
   @param {any} arg2
   */
  private _trigger<T, U>(eventName: string, arg1: T, arg2: U) {
    let callbacks = this._eventCallbacks[eventName];
    if (callbacks !== undefined) {
      for (let i = 0; i < callbacks.length; i++) {
        callbacks[i](arg1, arg2);
      }
    }
  }

  private _runExpiredTimers() {
    this._timerTimeoutId = undefined;
    this.run(this, this._scheduleExpiredTimers);
  }

  private _scheduleExpiredTimers() {
    let n = now();
    let timers = this._timers;
    let i = 0;
    let l = timers.length;
    for (; i < l; i += 2) {
      let executeAt = timers[i];
      let fn = timers[i + 1];
      if (executeAt <= n) {
        this.schedule(this.options.defaultQueue, null, fn);
      } else {
        break;
      }
    }
    timers.splice(0, i);
    this._installTimerTimeout();
  }

  private _reinstallTimerTimeout() {
    this._clearTimerTimeout();
    this._installTimerTimeout();
  }

  private _clearTimerTimeout() {
    if (this._timerTimeoutId === undefined) {
      return;
    }
    this._platform.clearTimeout(this._timerTimeoutId);
    this._timerTimeoutId = undefined;
  }

  private _installTimerTimeout() {
    if (this._timers.length === 0) {
      return;
    }
    let minExpiresAt = this._timers[0];
    let n = now();
    let wait = Math.max(0, minExpiresAt - n);
    this._timerTimeoutId = this._platform.setTimeout(this._boundRunExpiredTimers, wait);
  }

  private _ensureInstance(): DeferredActionQueues {
    let currentInstance = this.currentInstance;
    if (currentInstance === undefined || currentInstance === null) {
      const next = this._platform.next || this._platform.setTimeout; // TODO: remove the fallback
      currentInstance = this.begin();
      this._autorun = next(this._boundAutorunEnd);
    }
    return currentInstance;
  }
}
