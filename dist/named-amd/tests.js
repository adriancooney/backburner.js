define('backburner-tests', ['backburner'], function (Backburner) { 'use strict';

    var Backburner__default = 'default' in Backburner ? Backburner['default'] : Backburner;

    QUnit.module('tests/autorun');
    QUnit.test('autorun', function (assert) {
        var done = assert.async();
        var bb = new Backburner__default(['zomg']);
        var step = 0;
        assert.ok(!bb.currentInstance, 'The DeferredActionQueues object is lazily instaniated');
        assert.equal(step++, 0);
        bb.schedule('zomg', null, function () {
            assert.equal(step++, 2);
            setTimeout(function () {
                assert.ok(!bb.hasTimers(), 'The all timers are cleared');
                done();
            });
        });
        assert.ok(bb.currentInstance, 'The DeferredActionQueues object exists');
        assert.equal(step++, 1);
    });
    QUnit.test('autorun (joins next run if not yet flushed)', function (assert) {
        var bb = new Backburner__default(['zomg']);
        var order = -1;
        var tasks = {
            one: { count: 0, order: -1 },
            two: { count: 0, order: -1 }
        };
        bb.schedule('zomg', null, function () {
            tasks.one.count++;
            tasks.one.order = ++order;
        });
        assert.deepEqual(tasks, {
            one: { count: 0, order: -1 },
            two: { count: 0, order: -1 }
        });
        bb.run(function () {
            bb.schedule('zomg', null, function () {
                tasks.two.count++;
                tasks.two.order = ++order;
            });
            assert.deepEqual(tasks, {
                one: { count: 0, order: -1 },
                two: { count: 0, order: -1 }
            });
        });
        assert.deepEqual(tasks, {
            one: { count: 1, order: 0 },
            two: { count: 1, order: 1 }
        });
    });
    QUnit.test('autorun completes before items scheduled by later (via microtasks)', function (assert) {
        var done = assert.async();
        var bb = new Backburner__default(['first', 'second']);
        var order = new Array();
        // this later will be scheduled into the `first` queue when
        // its timer is up
        bb.later(function () {
            order.push('second - later');
        }, 0);
        // scheduling this into the second queue so that we can confirm this _still_
        // runs first (due to autorun resolving before scheduled timer)
        bb.schedule('second', null, function () {
            order.push('first - scheduled');
        });
        setTimeout(function () {
            assert.deepEqual(order, ['first - scheduled', 'second - later']);
            done();
        }, 20);
    });
    QUnit.test('can be canceled (private API)', function (assert) {
        assert.expect(0);
        var done = assert.async();
        var bb = new Backburner__default(['zomg']);
        bb.schedule('zomg', null, function () {
            assert.notOk(true, 'should not flush');
        });
        bb['_cancelAutorun']();
        setTimeout(done, 10);
    });
    QUnit.test('autorun interleaved with microtasks do not get dropped [GH#332]', function (assert) {
        var done = assert.async();
        var actual = [];
        var bb = new Backburner__default(['actions', 'render']);
        bb.schedule('render', function () {
            actual.push('first');
            bb.schedule('actions', function () {
                actual.push('action1');
            });
            Promise.resolve().then(function () {
                actual.push('second');
                bb.schedule('actions', function () {
                    actual.push('action2');
                });
                return Promise.resolve().then(function () {
                    actual.push('third');
                    bb.schedule('actions', function () {
                        actual.push('action3');
                    });
                });
            });
        });
        setTimeout(function () {
            assert.deepEqual(actual, ['first', 'action1', 'second', 'action2', 'third', 'action3']);
            done();
        });
    });

    QUnit.module('tests/bb-has-timers');
    QUnit.test('hasTimers', function (assert) {
        var done = assert.async();
        var bb = new Backburner__default(['ohai']);
        var timer;
        var target = {
            fn: function fn() { }
        };
        bb.schedule('ohai', null, function () {
            assert.ok(!bb.hasTimers(), 'Initially there are no timers');
            timer = bb.later('ohai', function () { });
            assert.ok(bb.hasTimers(), 'hasTimers checks timers');
            bb.cancel(timer);
            assert.ok(!bb.hasTimers(), 'Timers are cleared');
            timer = bb.debounce(target, 'fn', 200);
            assert.ok(bb.hasTimers(), 'hasTimers checks debouncees');
            bb.cancel(timer);
            assert.ok(!bb.hasTimers(), 'Timers are cleared');
            timer = bb.throttle(target, 'fn', 200);
            assert.ok(bb.hasTimers(), 'hasTimers checks throttlers');
            bb.cancel(timer);
            assert.ok(!bb.hasTimers(), 'Timers are cleared');
            done();
        });
    });

    QUnit.module('tests/cancel');
    QUnit.test('scheduleOnce', function (assert) {
        assert.expect(3);
        var bb = new Backburner__default(['one']);
        var functionWasCalled = false;
        bb.run(function () {
            var timer = bb.scheduleOnce('one', function () { return functionWasCalled = true; });
            assert.ok(timer, 'Timer object was returned');
            assert.ok(bb.cancel(timer), 'Cancel returned true');
            assert.ok(!functionWasCalled, 'function was not called');
        });
    });
    QUnit.test('setTimeout', function (assert) {
        assert.expect(5);
        var done = assert.async();
        var called = false;
        var bb = new Backburner__default(['one'], {
            onBegin: function onBegin() {
                called = true;
            }
        });
        var functionWasCalled = false;
        var timer = bb.later(function () { return functionWasCalled = true; });
        assert.ok(timer, 'Timer object was returned');
        assert.ok(bb.cancel(timer), 'Cancel returned true');
        assert.ok(!called, 'onBegin was not called');
        setTimeout(function () {
            assert.ok(!functionWasCalled, 'function was not called');
            assert.ok(!called, 'onBegin was not called');
            done();
        }, 0);
    });
    QUnit.test('setTimeout with multiple pending', function (assert) {
        assert.expect(7);
        var done = assert.async();
        var called = false;
        var bb = new Backburner__default(['one'], {
            onBegin: function onBegin() {
                called = true;
            }
        });
        var function1WasCalled = false;
        var function2WasCalled = false;
        var timer1 = bb.later(function () { return function1WasCalled = true; });
        var timer2 = bb.later(function () { return function2WasCalled = true; });
        assert.ok(timer1, 'Timer object 2 was returned');
        assert.ok(bb.cancel(timer1), 'Cancel for timer 1 returned true');
        assert.ok(timer2, 'Timer object 2 was returned');
        assert.ok(!called, 'onBegin was not called');
        setTimeout(function () {
            assert.ok(!function1WasCalled, 'function 1 was not called');
            assert.ok(function2WasCalled, 'function 2 was called');
            assert.ok(called, 'onBegin was called');
            done();
        }, 10);
    });
    QUnit.test('setTimeout and creating a new later', function (assert) {
        assert.expect(7);
        var done = assert.async();
        var called = false;
        var bb = new Backburner__default(['one'], {
            onBegin: function onBegin() {
                called = true;
            }
        });
        var function1WasCalled = false;
        var function2WasCalled = false;
        var timer1 = bb.later(function () { return function1WasCalled = true; }, 0);
        assert.ok(timer1, 'Timer object 2 was returned');
        assert.ok(bb.cancel(timer1), 'Cancel for timer 1 returned true');
        var timer2 = bb.later(function () { return function2WasCalled = true; }, 1);
        assert.ok(timer2, 'Timer object 2 was returned');
        assert.ok(!called, 'onBegin was not called');
        setTimeout(function () {
            assert.ok(!function1WasCalled, 'function 1 was not called');
            assert.ok(function2WasCalled, 'function 2 was called');
            assert.ok(called, 'onBegin was called');
            done();
        }, 50);
    });
    QUnit.test('cancelTimers', function (assert) {
        assert.expect(8);
        var done = assert.async();
        var bb = new Backburner__default(['one']);
        var laterWasCalled = false;
        var debounceWasCalled = false;
        var throttleWasCalled = false;
        var timer1 = bb.later(function () { return laterWasCalled = true; }, 0);
        var timer2 = bb.debounce(function () { return debounceWasCalled = true; }, 0);
        var timer3 = bb.throttle(function () { return throttleWasCalled = true; }, 0, false);
        assert.ok(timer1, 'Timer object was returned');
        assert.ok(timer2, 'Timer object was returned');
        assert.ok(timer3, 'Timer object was returned');
        assert.ok(bb.hasTimers(), 'bb has scheduled timer');
        bb.cancelTimers();
        setTimeout(function () {
            assert.ok(!bb.hasTimers(), 'bb has no scheduled timer');
            assert.ok(!laterWasCalled, 'later function was not called');
            assert.ok(!debounceWasCalled, 'debounce function was not called');
            assert.ok(!throttleWasCalled, 'throttle function was not called');
            done();
        }, 100);
    });
    QUnit.test('cancel during flush', function (assert) {
        assert.expect(1);
        var bb = new Backburner__default(['one']);
        var functionWasCalled = false;
        bb.run(function () {
            var timer1 = bb.scheduleOnce('one', function () { return bb.cancel(timer2); });
            var timer2 = bb.scheduleOnce('one', function () { return functionWasCalled = true; });
        });
        assert.ok(!functionWasCalled, 'function was not called');
    });
    QUnit.test('with target', function (assert) {
        assert.expect(3);
        var obj = {
            ___FOO___: 1
        };
        var bb = new Backburner__default(['action']);
        var wasCalled = 0;
        function fn() {
            wasCalled++;
        }
        bb.run(function () {
            var timer = bb.scheduleOnce('action', obj, fn);
            assert.equal(wasCalled, 0);
            bb.cancel(timer);
            bb.scheduleOnce('action', obj, fn);
            assert.equal(wasCalled, 0);
        });
        assert.equal(wasCalled, 1);
    });
    QUnit.test('no target', function (assert) {
        assert.expect(3);
        var bb = new Backburner__default(['action']);
        var wasCalled = 0;
        function fn() {
            wasCalled++;
        }
        bb.run(function () {
            var timer = bb.scheduleOnce('action', fn);
            assert.equal(wasCalled, 0);
            bb.cancel(timer);
            bb.scheduleOnce('action', fn);
            assert.equal(wasCalled, 0);
        });
        assert.equal(wasCalled, 1);
    });
    QUnit.test('cancel always returns boolean', function (assert) {
        var bb = new Backburner__default(['one']);
        bb.run(function () {
            var timer1 = bb.schedule('one', null, function () { });
            assert.equal(bb.cancel(timer1), true);
            assert.equal(bb.cancel(timer1), false);
            assert.equal(bb.cancel(timer1), false);
            var timer2 = bb.later(function () { }, 10);
            assert.equal(bb.cancel(timer2), true);
            assert.equal(bb.cancel(timer2), false);
            assert.equal(bb.cancel(timer2), false);
            var timer3 = bb.debounce(function () { }, 10);
            assert.equal(bb.cancel(timer3), true);
            assert.equal(bb.cancel(timer3), false);
            assert.equal(bb.cancel(timer3), false);
            assert.equal(bb.cancel(undefined), false);
            assert.equal(bb.cancel(null), false);
            assert.equal(bb.cancel({}), false);
            assert.equal(bb.cancel([]), false);
            assert.equal(bb.cancel(42), false);
            assert.equal(bb.cancel('42'), false);
        });
    });

    QUnit.module('tests/configurable-timeout');
    QUnit.test('We can configure a custom platform', function (assert) {
        assert.expect(1);
        var bb = new Backburner__default(['one'], {
            _buildPlatform: function _buildPlatform(flush) {
                var platform = Backburner.buildPlatform(flush);
                platform['isFakePlatform'] = true;
                return platform;
            }
        });
        assert.ok(bb['_platform']['isFakePlatform'], 'We can pass in a custom platform');
    });
    QUnit.test('We can use a custom setTimeout', function (assert) {
        assert.expect(1);
        var done = assert.async();
        var customNextWasUsed = false;
        var bb = new Backburner__default(['one'], {
            _buildPlatform: function _buildPlatform(flush) {
                return {
                    next: function next() {
                        throw new TypeError('NOT IMPLEMENTED');
                    },
                    clearNext: function clearNext() { },
                    setTimeout: function setTimeout$1(cb) {
                        customNextWasUsed = true;
                        return setTimeout(cb);
                    },
                    clearTimeout: function clearTimeout$1(timer) {
                        return clearTimeout(timer);
                    },
                    now: function now() {
                        return Date.now();
                    },
                    isFakePlatform: true
                };
            }
        });
        bb.setTimeout(function () {
            assert.ok(customNextWasUsed, 'custom later was used');
            done();
        });
    });
    QUnit.test('We can use a custom next', function (assert) {
        assert.expect(1);
        var done = assert.async();
        var customNextWasUsed = false;
        var bb = new Backburner__default(['one'], {
            _buildPlatform: function _buildPlatform(flush) {
                return {
                    setTimeout: function setTimeout() {
                        throw new TypeError('NOT IMPLEMENTED');
                    },
                    clearTimeout: function clearTimeout$1(timer) {
                        return clearTimeout(timer);
                    },
                    next: function next() {
                        // next is used for the autorun
                        customNextWasUsed = true;
                        return setTimeout(flush);
                    },
                    clearNext: function clearNext() { },
                    now: function now() { return Date.now(); },
                    isFakePlatform: true
                };
            }
        });
        bb.scheduleOnce('one', function () {
            assert.ok(customNextWasUsed, 'custom later was used');
            done();
        });
    });
    QUnit.test('We can use a custom clearTimeout', function (assert) {
        assert.expect(2);
        var functionWasCalled = false;
        var customClearTimeoutWasUsed = false;
        var bb = new Backburner__default(['one'], {
            _buildPlatform: function _buildPlatform(flush) {
                return {
                    setTimeout: function setTimeout$1(method, wait) {
                        return setTimeout(method, wait);
                    },
                    clearTimeout: function clearTimeout$1(timer) {
                        customClearTimeoutWasUsed = true;
                        return clearTimeout(timer);
                    },
                    next: function next() {
                        return setTimeout(flush, 0);
                    },
                    clearNext: function clearNext(timer) {
                        customClearTimeoutWasUsed = true;
                        return clearTimeout(timer);
                    },
                    now: function now() {
                        return Date.now();
                    }
                };
            }
        });
        bb.scheduleOnce('one', function () { return functionWasCalled = true; });
        bb.cancelTimers();
        bb.run(function () {
            bb.scheduleOnce('one', function () {
                assert.ok(!functionWasCalled, 'function was not called');
                assert.ok(customClearTimeoutWasUsed, 'custom clearTimeout was used');
            });
        });
    });
    QUnit.test('We can use a custom now', function (assert) {
        assert.expect(1);
        var done = assert.async();
        var currentTime = 10;
        var customNowWasUsed = false;
        var bb = new Backburner__default(['one'], {
            _buildPlatform: function _buildPlatform(flush) {
                return {
                    setTimeout: function setTimeout$1(method, wait) {
                        return setTimeout(method, wait);
                    },
                    clearTimeout: function clearTimeout$1(id) {
                        clearTimeout(id);
                    },
                    next: function next() {
                        return setTimeout(flush, 0);
                    },
                    clearNext: function clearNext() { },
                    now: function now() {
                        customNowWasUsed = true;
                        return currentTime += 10;
                    },
                };
            }
        });
        bb.later(function () {
            assert.ok(customNowWasUsed, 'custom now was used');
            done();
        }, 10);
    });

    QUnit.module('tests/debounce');
    QUnit.test('debounce', function (assert) {
        assert.expect(14);
        var bb = new Backburner__default(['zomg']);
        var step = 0;
        var done = assert.async();
        var wasCalled = false;
        function debouncee() {
            assert.ok(!wasCalled);
            wasCalled = true;
        }
        // let's debounce the function `debouncee` for 40ms
        // it will be executed 40ms after
        bb.debounce(null, debouncee, 40);
        assert.equal(step++, 0);
        // let's schedule `debouncee` to run in 10ms
        setTimeout(function () {
            assert.equal(step++, 1);
            assert.ok(!wasCalled, '@10ms, should not yet have been called');
            bb.debounce(null, debouncee, 40);
        }, 10);
        // let's schedule `debouncee` to run again in 30ms
        setTimeout(function () {
            assert.equal(step++, 2);
            assert.ok(!wasCalled, '@ 30ms, should not yet have been called');
            bb.debounce(null, debouncee, 40);
        }, 30);
        // let's schedule `debouncee` to run yet again in 60ms
        setTimeout(function () {
            assert.equal(step++, 3);
            assert.ok(!wasCalled, '@ 60ms, should not yet have been called');
            bb.debounce(null, debouncee, 40);
        }, 60);
        // now, let's schedule an assertion to occur at 110ms,
        // 10ms after `debouncee` has been called the last time
        setTimeout(function () {
            assert.equal(step++, 4);
            assert.ok(wasCalled, '@ 110ms should have been called');
        }, 110);
        // great, we've made it this far, there's one more thing
        // we need to test. we want to make sure we can call `debounce`
        // again with the same target/method after it has executed
        // at the 120ms mark, let's schedule another call to `debounce`
        setTimeout(function () {
            wasCalled = false; // reset the flag
            // assert call order
            assert.equal(step++, 5);
            // call debounce for the second time
            bb.debounce(null, debouncee, 100);
            // assert that it is called in the future and not blackholed
            setTimeout(function () {
                assert.equal(step++, 6);
                assert.ok(wasCalled, 'Another debounce call with the same function can be executed later');
                done();
            }, 230);
        }, 120);
    });
    QUnit.test('debounce - immediate', function (assert) {
        assert.expect(16);
        var done = assert.async();
        var bb = new Backburner__default(['zomg']);
        var step = 0;
        var wasCalled = false;
        function debouncee() {
            assert.ok(!wasCalled);
            wasCalled = true;
        }
        // let's debounce the function `debouncee` for 40ms
        // it will be executed immediately, and prevent
        // any actions for 40ms after
        bb.debounce(null, debouncee, 40, true);
        assert.equal(step++, 0);
        assert.ok(wasCalled);
        wasCalled = false;
        // let's schedule `debouncee` to run in 10ms
        setTimeout(function () {
            assert.equal(step++, 1);
            assert.ok(!wasCalled);
            bb.debounce(null, debouncee, 40, true);
        }, 10);
        // let's schedule `debouncee` to run again in 30ms
        setTimeout(function () {
            assert.equal(step++, 2);
            assert.ok(!wasCalled);
            bb.debounce(null, debouncee, 40, true);
        }, 30);
        // let's schedule `debouncee` to run yet again in 60ms
        setTimeout(function () {
            assert.equal(step++, 3);
            assert.ok(!wasCalled);
            bb.debounce(null, debouncee, 40, true);
        }, 60);
        // now, let's schedule an assertion to occur at 110ms,
        // 10ms after `debouncee` has been called the last time
        setTimeout(function () {
            assert.equal(step++, 4);
            assert.ok(!wasCalled);
        }, 110);
        // great, we've made it this far, there's one more thing
        // we need to QUnit.test. we want to make sure we can call `debounce`
        // again with the same target/method after it has executed
        // at the 120ms mark, let's schedule another call to `debounce`
        setTimeout(function () {
            wasCalled = false; // reset the flag
            // assert call order
            assert.equal(step++, 5);
            // call debounce for the second time
            bb.debounce(null, debouncee, 100, true);
            assert.ok(wasCalled, 'Another debounce call with the same function can be executed later');
            wasCalled = false;
            // assert that it is called in the future and not blackholed
            setTimeout(function () {
                assert.equal(step++, 6);
                assert.ok(!wasCalled);
                done();
            }, 230);
        }, 120);
    });
    QUnit.test('debounce + immediate joins existing run loop instances', function (assert) {
        assert.expect(1);
        function onError(error) {
            throw error;
        }
        var bb = new Backburner__default(['errors'], {
            onError: onError
        });
        bb.run(function () {
            var parentInstance = bb.currentInstance;
            bb.debounce(null, function () {
                assert.equal(bb.currentInstance, parentInstance);
            }, 20, true);
        });
    });
    QUnit.test('debounce accept time interval like string numbers', function (assert) {
        var done = assert.async();
        var bb = new Backburner__default(['zomg']);
        var step = 0;
        var wasCalled = false;
        function debouncee() {
            assert.ok(!wasCalled);
            wasCalled = true;
        }
        bb.debounce(null, debouncee, '40');
        assert.equal(step++, 0);
        setTimeout(function () {
            assert.equal(step++, 1);
            assert.ok(!wasCalled);
            bb.debounce(null, debouncee, '40');
        }, 10);
        setTimeout(function () {
            assert.equal(step++, 2);
            assert.ok(wasCalled);
            done();
        }, 60);
    });
    QUnit.test('debounce returns timer information usable for canceling', function (assert) {
        assert.expect(3);
        var done = assert.async();
        var bb = new Backburner__default(['batman']);
        var wasCalled = false;
        function debouncee() {
            assert.ok(false, 'this method shouldn\'t be called');
            wasCalled = true;
        }
        var timer = bb.debounce(null, debouncee, 1);
        assert.ok(bb.cancel(timer), 'the timer is cancelled');
        // should return false second time around
        assert.ok(!bb.cancel(timer), 'the timer no longer exists in the list');
        setTimeout(function () {
            assert.ok(!wasCalled, 'the timer wasn\'t called after waiting');
            done();
        }, 60);
    });
    QUnit.test('debounce cancelled after it\'s executed returns false', function (assert) {
        assert.expect(3);
        var done = assert.async();
        var bb = new Backburner__default(['darkknight']);
        var wasCalled = false;
        function debouncee() {
            assert.ok(true, 'the debounced method was called');
            wasCalled = true;
        }
        var timer = bb.debounce(null, debouncee, 1);
        setTimeout(function () {
            assert.ok(!bb.cancel(timer), 'no timer existed to cancel');
            assert.ok(wasCalled, 'the timer was actually called');
            done();
        }, 10);
    });
    QUnit.test('debounced function is called with final argument', function (assert) {
        assert.expect(1);
        var done = assert.async();
        var bb = new Backburner__default(['joker']);
        function debouncee(arg) {
            assert.equal('bus', arg, 'the debounced is called with right argument');
            done();
        }
        bb.debounce(null, debouncee, 'car', 10);
        bb.debounce(null, debouncee, 'bicycle', 10);
        bb.debounce(null, debouncee, 'bus', 10);
    });
    QUnit.test('debounce cancelled doesn\'t cancel older items', function (assert) {
        assert.expect(4);
        var bb = new Backburner__default(['robin']);
        var wasCalled = false;
        var done = assert.async();
        function debouncee() {
            assert.ok(true, 'the debounced method was called');
            if (wasCalled) {
                done();
            }
            wasCalled = true;
        }
        var timer = bb.debounce(null, debouncee, 1);
        setTimeout(function () {
            bb.debounce(null, debouncee, 1);
            assert.ok(!bb.cancel(timer), 'the second timer isn\'t removed, despite appearing to be the same');
            assert.ok(wasCalled, 'the timer was actually called');
        }, 10);
    });
    QUnit.test('debounce that is immediate, and cancelled and called again happens immediately', function (assert) {
        assert.expect(3);
        var done = assert.async();
        var bb = new Backburner__default(['robin']);
        var calledCount = 0;
        function debouncee() {
            calledCount++;
        }
        var timer = bb.debounce(null, debouncee, 1000, true);
        setTimeout(function () {
            assert.equal(1, calledCount, 'debounced method was called');
            assert.ok(bb.cancel(timer), 'debounced delay was cancelled');
            bb.debounce(null, debouncee, 1000, true);
            setTimeout(function () {
                assert.equal(2, calledCount, 'debounced method was called again immediately');
                done();
            }, 10);
        }, 10);
    });
    QUnit.test('debounce without a target, without args', function (assert) {
        var done = assert.async();
        var bb = new Backburner__default(['batman']);
        var calledCount = 0;
        var calledWith = new Array();
        function debouncee() {
            var args = [], len = arguments.length;
            while ( len-- ) args[ len ] = arguments[ len ];

            calledCount++;
            calledWith.push(args);
        }
        bb.debounce(debouncee, 10);
        bb.debounce(debouncee, 10);
        bb.debounce(debouncee, 10);
        assert.equal(calledCount, 0, 'debounced method was not called immediately');
        setTimeout(function () {
            assert.equal(calledCount, 0, 'debounced method was not called on next tick');
        }, 0);
        setTimeout(function () {
            assert.equal(calledCount, 1, 'debounced method was was only called once');
            assert.deepEqual(calledWith, [[]], 'debounce called once without arguments');
            done();
        }, 20);
    });
    QUnit.test('debounce without a target, without args - can be canceled', function (assert) {
        var done = assert.async();
        var bb = new Backburner__default(['batman']);
        var calledCount = 0;
        function debouncee() {
            calledCount++;
        }
        bb.debounce(debouncee, 10);
        bb.debounce(debouncee, 10);
        var timer = bb.debounce(debouncee, 10);
        assert.equal(calledCount, 0, 'debounced method was not called immediately');
        setTimeout(function () {
            bb.cancel(timer);
            assert.equal(calledCount, 0, 'debounced method was not called on next tick');
        }, 0);
        setTimeout(function () {
            assert.equal(calledCount, 0, 'debounced method was canceled properly');
            done();
        }, 20);
    });
    QUnit.test('debounce without a target, without args, immediate', function (assert) {
        var done = assert.async();
        var bb = new Backburner__default(['batman']);
        var calledCount = 0;
        var calledWith = new Array();
        function debouncee() {
            var args = [], len = arguments.length;
            while ( len-- ) args[ len ] = arguments[ len ];

            calledCount++;
            calledWith.push(args);
        }
        bb.debounce(debouncee, 10, true);
        bb.debounce(debouncee, 10, true);
        bb.debounce(debouncee, 10, true);
        assert.equal(calledCount, 1, 'debounced method was called immediately');
        assert.deepEqual(calledWith, [[]], 'debounce method was called with the correct arguments');
        setTimeout(function () {
            bb.debounce(debouncee, 10, true);
            assert.equal(calledCount, 1, 'debounced method was not called again within the time window');
        }, 0);
        setTimeout(function () {
            assert.equal(calledCount, 1, 'debounced method was was only called once');
            done();
        }, 20);
    });
    QUnit.test('debounce without a target, without args, immediate - can be canceled', function (assert) {
        var bb = new Backburner__default(['batman']);
        var fooCalledCount = 0;
        var barCalledCount = 0;
        function foo() {
            fooCalledCount++;
        }
        function bar() {
            barCalledCount++;
        }
        bb.debounce(foo, 10, true);
        bb.debounce(foo, 10, true);
        assert.equal(fooCalledCount, 1, 'foo was called immediately, then debounced');
        bb.debounce(bar, 10, true);
        var timer = bb.debounce(bar, 10, true);
        assert.equal(barCalledCount, 1, 'bar was called immediately, then debounced');
        bb.cancel(timer);
        bb.debounce(bar, 10, true);
        assert.equal(barCalledCount, 2, 'after canceling the prior debounce, bar was called again');
    });
    QUnit.test('debounce without a target, with args', function (assert) {
        var done = assert.async();
        var bb = new Backburner__default(['batman']);
        var calledCount = 0;
        var calledWith = [];
        function debouncee(first) {
            calledCount++;
            calledWith.push(first);
        }
        var foo = { isFoo: true };
        var bar = { isBar: true };
        var baz = { isBaz: true };
        bb.debounce(debouncee, foo, 10);
        bb.debounce(debouncee, bar, 10);
        bb.debounce(debouncee, baz, 10);
        assert.equal(calledCount, 0, 'debounced method was not called immediately');
        setTimeout(function () {
            assert.deepEqual(calledWith, [{ isBaz: true }], 'debounce method was only called once, with correct argument');
            done();
        }, 20);
    });
    QUnit.test('debounce without a target, with args - can be canceled', function (assert) {
        var done = assert.async();
        var bb = new Backburner__default(['batman']);
        var calledCount = 0;
        var calledWith = [];
        function debouncee(first) {
            calledCount++;
            calledWith.push(first);
        }
        var foo = { isFoo: true };
        var bar = { isBar: true };
        var baz = { isBaz: true };
        bb.debounce(debouncee, foo, 10);
        bb.debounce(debouncee, bar, 10);
        var timer = bb.debounce(debouncee, baz, 10);
        assert.equal(calledCount, 0, 'debounced method was not called immediately');
        setTimeout(function () {
            assert.deepEqual(calledWith, [], 'debounce method has not been called on next tick');
            bb.cancel(timer);
        }, 0);
        setTimeout(function () {
            assert.deepEqual(calledWith, [], 'debounce method is not called when canceled');
            done();
        }, 20);
    });
    QUnit.test('debounce without a target, with args, immediate', function (assert) {
        var done = assert.async();
        var bb = new Backburner__default(['batman']);
        var calledWith = new Array();
        function debouncee(first) {
            calledWith.push(first);
        }
        var foo = { isFoo: true };
        var bar = { isBar: true };
        var baz = { isBaz: true };
        var qux = { isQux: true };
        bb.debounce(debouncee, foo, 10, true);
        bb.debounce(debouncee, bar, 10, true);
        bb.debounce(debouncee, baz, 10, true);
        assert.deepEqual(calledWith, [{ isFoo: true }], 'debounce method was only called once, with correct argument');
        setTimeout(function () {
            bb.debounce(debouncee, qux, 10, true);
            assert.deepEqual(calledWith, [{ isFoo: true }], 'debounce method was only called once, with correct argument');
        }, 0);
        setTimeout(function () {
            assert.deepEqual(calledWith, [{ isFoo: true }], 'debounce method was only called once, with correct argument');
            done();
        }, 20);
    });
    QUnit.test('debounce without a target, with args, immediate - can be canceled', function (assert) {
        var done = assert.async();
        var bb = new Backburner__default(['batman']);
        var calledWith = [];
        function debouncee(first) {
            calledWith.push(first);
        }
        var foo = { isFoo: true };
        var bar = { isBar: true };
        var baz = { isBaz: true };
        var qux = { isQux: true };
        bb.debounce(debouncee, foo, 10, true);
        bb.debounce(debouncee, bar, 10, true);
        var timer = bb.debounce(debouncee, baz, 10, true);
        assert.deepEqual(calledWith, [{ isFoo: true }], 'debounce method was only called once, with correct argument');
        setTimeout(function () {
            bb.cancel(timer);
            bb.debounce(debouncee, qux, 10, true);
            assert.deepEqual(calledWith, [{ isFoo: true }, { isQux: true }], 'debounce method was called again after canceling prior timer');
        }, 0);
        setTimeout(function () {
            assert.deepEqual(calledWith, [{ isFoo: true }, { isQux: true }], 'debounce method was not called again');
            done();
        }, 20);
    });
    QUnit.test('onError', function (assert) {
        assert.expect(1);
        var done = assert.async();
        function onError(error) {
            assert.equal('QUnit.test error', error.message);
            done();
        }
        var bb = new Backburner__default(['errors'], {
            onError: onError
        });
        bb.debounce(null, function () { throw new Error('QUnit.test error'); }, 20);
    });
    QUnit.test('debounce within a debounce can be canceled GH#183', function (assert) {
        assert.expect(3);
        var done = assert.async();
        var bb = new Backburner__default(['zomg']);
        var foo = function () {
            assert.ok(true, 'foo called');
            return bb.debounce(bar, 10);
        };
        var bar = function () {
            assert.ok(true, 'bar called');
            var timer = foo();
            bb.cancel(timer);
            setTimeout(done, 10);
        };
        foo();
    });
    QUnit.test('when [callback, string] args passed', function (assert) {
        assert.expect(2);
        var bb = new Backburner__default(['one']);
        var functionWasCalled = false;
        bb.run(function () {
            bb.debounce(function (name) {
                assert.equal(name, 'batman');
                functionWasCalled = true;
            }, 'batman', 100, true);
        });
        assert.ok(functionWasCalled, 'function was called');
    });

    QUnit.module('tests/debug');
    QUnit.test('schedule - DEBUG flag enables stack tagging', function (assert) {
        var bb = new Backburner__default(['one']);
        bb.schedule('one', function () { });
        if (!bb.currentInstance) {
            throw new Error('bb has no instance');
        }
        assert.ok(bb.currentInstance && !bb.currentInstance.queues.one.stackFor(0), 'No stack is recorded');
        bb.DEBUG = true;
        bb.schedule('one', function () { });
        if (new Error().stack) {
            assert.expect(4);
            var done = assert.async();
            var stack = bb.currentInstance && bb.currentInstance.queues.one.stackFor(1);
            assert.ok(typeof stack === 'string', 'A stack is recorded');
            var onError = function (error, errorRecordedForStack) {
                assert.ok(errorRecordedForStack, 'errorRecordedForStack passed to error function');
                assert.ok(errorRecordedForStack.stack, 'stack is recorded');
                done();
            };
            bb = new Backburner__default(['errors'], { onError: onError });
            bb.DEBUG = true;
            bb.run(function () {
                bb.schedule('errors', function () {
                    throw new Error('message!');
                });
            });
        }
    });
    QUnit.test('later - DEBUG flag off does not capture stack', function (assert) {
        var done = assert.async();
        var onError = function (error, errorRecordedForStack) {
            assert.strictEqual(errorRecordedForStack, undefined, 'errorRecordedForStack is not passed to error function when DEBUG is not set');
            done();
        };
        var bb = new Backburner__default(['one'], { onError: onError });
        bb.later(function () {
            throw new Error('message!');
        });
    });
    if (new Error().stack) {
        QUnit.test('later - DEBUG flag on captures stack', function (assert) {
            assert.expect(3);
            var done = assert.async();
            var onError = function (error, errorRecordedForStack) {
                assert.ok(errorRecordedForStack, 'errorRecordedForStack passed to error function');
                assert.ok(errorRecordedForStack.stack, 'stack is recorded');
                assert.ok(errorRecordedForStack.stack.indexOf('later') > -1, 'stack includes `later` invocation');
                done();
            };
            var bb = new Backburner__default(['one'], { onError: onError });
            bb.DEBUG = true;
            bb.later(function () {
                throw new Error('message!');
            });
        });
    }

    QUnit.module('tests/defer-iterable');
    var Iterator = function Iterator(collection) {
        this._iteration = 0;
        this._collection = collection;
    };
    Iterator.prototype.next = function next () {
        var iteration = this._iteration++;
        var collection = this._collection;
        var done = collection.length <= iteration;
        var value = done ? undefined : collection[iteration];
        return {
            done: done,
            value: value
        };
    };
    QUnit.test('deferIterable', function (assert) {
        var bb = new Backburner__default(['zomg']);
        var order = 0;
        var tasks = {
            one: { count: 0, order: -1 },
            two: { count: 0, order: -1 },
            three: { count: 0, order: -1 }
        };
        function task1() {
            tasks.one.count++;
            tasks.one.order = order++;
        }
        function task2() {
            tasks.two.count++;
            tasks.two.order = order++;
        }
        function task3() {
            tasks.three.count++;
            tasks.three.order = order++;
        }
        var iterator = function () { return new Iterator([
            task1,
            task2,
            task3
        ]); };
        bb.run(function () {
            bb.scheduleIterable('zomg', iterator);
            assert.deepEqual(tasks, {
                one: { count: 0, order: -1 },
                two: { count: 0, order: -1 },
                three: { count: 0, order: -1 }
            });
        });
        assert.deepEqual(tasks, {
            one: { count: 1, order: 0 },
            two: { count: 1, order: 1 },
            three: { count: 1, order: 2 }
        });
    });

    QUnit.module('tests/defer-once');
    QUnit.test('when passed a function', function (assert) {
        assert.expect(1);
        var bb = new Backburner__default(['one']);
        var functionWasCalled = false;
        bb.run(function () {
            bb.scheduleOnce('one', function () {
                functionWasCalled = true;
            });
        });
        assert.ok(functionWasCalled, 'function was called');
    });
    QUnit.test('when passed a target and method', function (assert) {
        assert.expect(2);
        var bb = new Backburner__default(['one']);
        var functionWasCalled = false;
        bb.run(function () {
            bb.scheduleOnce('one', { zomg: 'hi' }, function () {
                assert.equal(this.zomg, 'hi', 'the target was properly set');
                functionWasCalled = true;
            });
        });
        assert.ok(functionWasCalled, 'function was called');
    });
    QUnit.test('when passed a target and method name', function (assert) {
        assert.expect(2);
        var bb = new Backburner__default(['one']);
        var functionWasCalled = false;
        var targetObject = {
            zomg: 'hi',
            checkFunction: function checkFunction() {
                assert.equal(this.zomg, 'hi', 'the target was properly set');
                functionWasCalled = true;
            }
        };
        bb.run(function () { return bb.scheduleOnce('one', targetObject, 'checkFunction'); });
        assert.ok(functionWasCalled, 'function was called');
    });
    QUnit.test('throws when passed a null method', function (assert) {
        assert.expect(1);
        function onError(error) {
            assert.equal('You attempted to schedule an action in a queue (deferErrors) for a method that doesn\'t exist', error.message);
        }
        var bb = new Backburner__default(['deferErrors'], {
            onError: onError
        });
        bb.run(function () { return bb.scheduleOnce('deferErrors', { zomg: 'hi' }, null); });
    });
    QUnit.test('throws when passed an undefined method', function (assert) {
        assert.expect(1);
        function onError(error) {
            assert.equal('You attempted to schedule an action in a queue (deferErrors) for a method that doesn\'t exist', error.message);
        }
        var bb = new Backburner__default(['deferErrors'], {
            onError: onError
        });
        bb.run(function () { return bb.deferOnce('deferErrors', { zomg: 'hi' }, undefined); });
    });
    QUnit.test('throws when passed an method name that does not exists on the target', function (assert) {
        assert.expect(1);
        function onError(error) {
            assert.equal('You attempted to schedule an action in a queue (deferErrors) for a method that doesn\'t exist', error.message);
        }
        var bb = new Backburner__default(['deferErrors'], {
            onError: onError
        });
        bb.run(function () { return bb.deferOnce('deferErrors', { zomg: 'hi' }, 'checkFunction'); });
    });
    QUnit.test('when passed a target, method, and arguments', function (assert) {
        assert.expect(5);
        var bb = new Backburner__default(['one']);
        var functionWasCalled = false;
        bb.run(function () {
            bb.scheduleOnce('one', { zomg: 'hi' }, function (a, b, c) {
                assert.equal(this.zomg, 'hi', 'the target was properly set');
                assert.equal(a, 1, 'the first arguments was passed in');
                assert.equal(b, 2, 'the second arguments was passed in');
                assert.equal(c, 3, 'the third arguments was passed in');
                functionWasCalled = true;
            }, 1, 2, 3);
        });
        assert.ok(functionWasCalled, 'function was called');
    });
    QUnit.test('when passed same function twice', function (assert) {
        assert.expect(2);
        var bb = new Backburner__default(['one']);
        var i = 0;
        var functionWasCalled = false;
        function deferMethod() {
            i++;
            assert.equal(i, 1, 'Function should be called only once');
            functionWasCalled = true;
        }
        bb.run(function () {
            bb.scheduleOnce('one', deferMethod);
            bb.scheduleOnce('one', deferMethod);
        });
        assert.ok(functionWasCalled, 'function was called only once');
    });
    QUnit.test('when passed same function twice with same target', function (assert) {
        assert.expect(3);
        var bb = new Backburner__default(['one']);
        var i = 0;
        var functionWasCalled = false;
        function deferMethod() {
            i++;
            assert.equal(i, 1, 'Function should be called only once');
            assert.equal(this['first'], 1, 'the target property was set');
            functionWasCalled = true;
        }
        var argObj = { first: 1 };
        bb.run(function () {
            bb.scheduleOnce('one', argObj, deferMethod);
            bb.scheduleOnce('one', argObj, deferMethod);
        });
        assert.ok(functionWasCalled, 'function was called only once');
    });
    QUnit.test('when passed same function twice with different targets', function (assert) {
        assert.expect(3);
        var bb = new Backburner__default(['one']);
        var i = 0;
        function deferMethod() {
            i++;
            assert.equal(this['first'], 1, 'the target property was set');
        }
        bb.run(function () {
            bb.scheduleOnce('one', { first: 1 }, deferMethod);
            bb.scheduleOnce('one', { first: 1 }, deferMethod);
        });
        assert.equal(i, 2, 'function was called twice');
    });
    QUnit.test('when passed same function twice with same arguments and same target', function (assert) {
        assert.expect(4);
        var bb = new Backburner__default(['one']);
        var i = 0;
        function deferMethod(a, b) {
            i++;
            assert.equal(a, 1, 'First argument is set only one time');
            assert.equal(b, 2, 'Second argument remains same');
            assert.equal(this['first'], 1, 'the target property was set');
        }
        var argObj = { first: 1 };
        bb.run(function () {
            bb.scheduleOnce('one', argObj, deferMethod, 1, 2);
            bb.scheduleOnce('one', argObj, deferMethod, 1, 2);
        });
        assert.equal(i, 1, 'function was called once');
    });
    QUnit.test('when passed same function twice with same target and different arguments', function (assert) {
        assert.expect(4);
        var bb = new Backburner__default(['one']);
        var i = 0;
        function deferMethod(a, b) {
            i++;
            assert.equal(a, 3, 'First argument of only second call is set');
            assert.equal(b, 2, 'Second argument remains same');
            assert.equal(this['first'], 1, 'the target property was set');
        }
        var argObj = { first: 1 };
        bb.run(function () {
            bb.scheduleOnce('one', argObj, deferMethod, 1, 2);
            bb.scheduleOnce('one', argObj, deferMethod, 3, 2);
        });
        assert.equal(i, 1, 'function was called once');
    });
    QUnit.test('when passed same function twice with different target and different arguments', function (assert) {
        assert.expect(7);
        var bb = new Backburner__default(['one']);
        var i = 0;
        function deferMethod(a, b) {
            i++;
            if (i === 1) {
                assert.equal(a, 1, 'First argument set during first call');
            }
            else {
                assert.equal(a, 3, 'First argument set during second call');
            }
            assert.equal(b, 2, 'Second argument remains same');
            assert.equal(this['first'], 1, 'the target property was set');
        }
        bb.run(function () {
            bb.scheduleOnce('one', { first: 1 }, deferMethod, 1, 2);
            bb.scheduleOnce('one', { first: 1 }, deferMethod, 3, 2);
        });
        assert.equal(i, 2, 'function was called twice');
    });
    QUnit.test('when passed same function with same target after already triggering in current loop', function (assert) {
        assert.expect(5);
        var bb = new Backburner__default(['one', 'two']);
        var i = 0;
        function deferMethod(a) {
            i++;
            assert.equal(a, i, 'Correct argument is set');
            assert.equal(this['first'], 1, 'the target property was set');
        }
        function scheduleMethod() {
            bb.scheduleOnce('one', argObj, deferMethod, 2);
        }
        var argObj = { first: 1 };
        bb.run(function () {
            bb.scheduleOnce('one', argObj, deferMethod, 1);
            bb.scheduleOnce('two', argObj, scheduleMethod);
        });
        assert.equal(i, 2, 'function was called twice');
    });
    QUnit.test('when passed same function with same target after already triggering in current loop', function (assert) {
        assert.expect(5);
        var argObj = { first: 1 };
        var bb = new Backburner__default(['one', 'two'], {});
        var i = 0;
        function deferMethod(a) {
            i++;
            assert.equal(a, i, 'Correct argument is set');
            assert.equal(this['first'], 1, 'the target property was set');
        }
        function scheduleMethod() {
            bb.scheduleOnce('one', argObj, deferMethod, 2);
        }
        bb.run(function () {
            bb.scheduleOnce('one', argObj, deferMethod, 1);
            bb.scheduleOnce('two', argObj, scheduleMethod);
        });
        assert.equal(i, 2, 'function was called twice');
    });
    QUnit.test('onError', function (assert) {
        assert.expect(1);
        function onError(error) {
            assert.equal('QUnit.test error', error.message);
        }
        var bb = new Backburner__default(['errors'], { onError: onError });
        bb.run(function () {
            bb.scheduleOnce('errors', function () {
                throw new Error('QUnit.test error');
            });
        });
    });
    QUnit.test('when [queueName, callback, string] args passed', function (assert) {
        assert.expect(2);
        var bb = new Backburner__default(['one']);
        var functionWasCalled = false;
        bb.run(function () {
            bb.scheduleOnce('one', function (name) {
                assert.equal(name, 'batman');
                functionWasCalled = true;
            }, 'batman', 100);
        });
        assert.ok(functionWasCalled, 'function was called');
    });

    var originalDateValueOf = Date.prototype.valueOf;
    QUnit.module('tests/defer', {
        afterEach: function afterEach() {
            Date.prototype.valueOf = originalDateValueOf;
        }
    });
    QUnit.test('when passed a function', function (assert) {
        assert.expect(1);
        var bb = new Backburner__default(['one']);
        var functionWasCalled = false;
        bb.run(function () {
            bb.schedule('one', function () { return functionWasCalled = true; });
        });
        assert.ok(functionWasCalled, 'function was called');
    });
    QUnit.test('when passed a target and method', function (assert) {
        assert.expect(2);
        var bb = new Backburner__default(['one']);
        var functionWasCalled = false;
        bb.run(function () {
            bb.schedule('one', { zomg: 'hi' }, function () {
                assert.equal(this.zomg, 'hi', 'the target was properly set');
                functionWasCalled = true;
            });
        });
        assert.ok(functionWasCalled, 'function was called');
    });
    QUnit.test('when [queueName, callback, string] args passed', function (assert) {
        assert.expect(2);
        var bb = new Backburner__default(['one']);
        var functionWasCalled = false;
        bb.run(function () {
            bb.schedule('one', function (name) {
                assert.equal(name, 'batman');
                functionWasCalled = true;
            }, 'batman');
        });
        assert.ok(functionWasCalled, 'function was called');
    });
    QUnit.test('when passed a target and method name', function (assert) {
        assert.expect(2);
        var bb = new Backburner__default(['one']);
        var functionWasCalled = false;
        var targetObject = {
            zomg: 'hi',
            checkFunction: function checkFunction() {
                assert.equal(this.zomg, 'hi', 'the target was properly set');
                functionWasCalled = true;
            }
        };
        bb.run(function () { return bb.schedule('one', targetObject, 'checkFunction'); });
        assert.ok(functionWasCalled, 'function was called');
    });
    QUnit.test('throws when passed a null method', function (assert) {
        assert.expect(1);
        function onError(error) {
            assert.equal('You attempted to schedule an action in a queue (deferErrors) for a method that doesn\'t exist', error.message);
        }
        var bb = new Backburner__default(['deferErrors'], {
            onError: onError
        });
        bb.run(function () { return bb.schedule('deferErrors', { zomg: 'hi' }, null); });
    });
    QUnit.test('throws when passed an undefined method', function (assert) {
        assert.expect(1);
        function onError(error) {
            assert.equal('You attempted to schedule an action in a queue (deferErrors) for a method that doesn\'t exist', error.message);
        }
        var bb = new Backburner__default(['deferErrors'], {
            onError: onError
        });
        bb.run(function () { return bb.schedule('deferErrors', { zomg: 'hi' }, undefined); });
    });
    QUnit.test('throws when passed an method name that does not exists on the target', function (assert) {
        assert.expect(1);
        function onError(error) {
            assert.equal('You attempted to schedule an action in a queue (deferErrors) for a method that doesn\'t exist', error.message);
        }
        var bb = new Backburner__default(['deferErrors'], {
            onError: onError
        });
        bb.run(function () { return bb.schedule('deferErrors', { zomg: 'hi' }, 'checkFunction'); });
    });
    QUnit.test('when passed a target, method, and arguments', function (assert) {
        assert.expect(5);
        var bb = new Backburner__default(['one']);
        var functionWasCalled = false;
        bb.run(function () {
            bb.schedule('one', { zomg: 'hi' }, function (a, b, c) {
                assert.equal(this.zomg, 'hi', 'the target was properly set');
                assert.equal(a, 1, 'the first arguments was passed in');
                assert.equal(b, 2, 'the second arguments was passed in');
                assert.equal(c, 3, 'the third arguments was passed in');
                functionWasCalled = true;
            }, 1, 2, 3);
        });
        assert.ok(functionWasCalled, 'function was called');
    });
    QUnit.test('when passed same function twice', function (assert) {
        assert.expect(1);
        var bb = new Backburner__default(['one']);
        var i = 0;
        function deferMethod() {
            i++;
        }
        bb.run(function () {
            bb.schedule('one', deferMethod);
            bb.schedule('one', deferMethod);
        });
        assert.equal(i, 2, 'function was called twice');
    });
    QUnit.test('when passed same function twice with arguments', function (assert) {
        assert.expect(2);
        var bb = new Backburner__default(['one']);
        var argObj = { first: 1 };
        function deferMethod() {
            assert.equal(this['first'], 1, 'the target property was set');
        }
        bb.run(function () {
            bb.schedule('one', argObj, deferMethod);
            bb.schedule('one', argObj, deferMethod);
        });
    });
    QUnit.test('when passed same function twice with same arguments and same target', function (assert) {
        assert.expect(7);
        var bb = new Backburner__default(['one']);
        var i = 0;
        function deferMethod(a, b) {
            i++;
            assert.equal(a, 1, 'First argument is set twice');
            assert.equal(b, 2, 'Second argument is set twice');
            assert.equal(this['first'], 1, 'the target property was set');
        }
        var argObj = { first: 1 };
        bb.run(function () {
            bb.schedule('one', argObj, deferMethod, 1, 2);
            bb.schedule('one', argObj, deferMethod, 1, 2);
        });
        assert.equal(i, 2, 'function was called twice');
    });
    QUnit.test('when passed same function twice with same target and different arguments', function (assert) {
        assert.expect(7);
        var bb = new Backburner__default(['one']);
        var i = 0;
        function deferMethod(a, b) {
            i++;
            if (i === 1) {
                assert.equal(a, 1, 'First argument set during first call');
            }
            else {
                assert.equal(a, 3, 'First argument set during second call');
            }
            assert.equal(b, 2, 'Second argument remains same');
            assert.equal(this['first'], 1, 'the target property was set');
        }
        var argObj = { first: 1 };
        bb.run(function () {
            bb.schedule('one', argObj, deferMethod, 1, 2);
            bb.schedule('one', argObj, deferMethod, 3, 2);
        });
        assert.equal(i, 2, 'function was called twice');
    });
    QUnit.test('when passed same function twice with different target and different arguments', function (assert) {
        assert.expect(7);
        var bb = new Backburner__default(['one']);
        var i = 0;
        function deferMethod(a, b) {
            i++;
            if (i === 1) {
                assert.equal(a, 1, 'First argument set during first call');
            }
            else {
                assert.equal(a, 3, 'First argument set during second call');
            }
            assert.equal(b, 2, 'Second argument remains same');
            assert.equal(this['first'], 1, 'the target property was set');
        }
        bb.run(function () {
            bb.schedule('one', { first: 1 }, deferMethod, 1, 2);
            bb.schedule('one', { first: 1 }, deferMethod, 3, 2);
        });
        assert.equal(i, 2, 'function was called twice');
    });
    QUnit.test('onError', function (assert) {
        assert.expect(1);
        function onError(error) {
            assert.equal('QUnit.test error', error.message);
        }
        var bb = new Backburner__default(['errors'], {
            onError: onError
        });
        bb.run(function () {
            bb.schedule('errors', function () {
                throw new Error('QUnit.test error');
            });
        });
    });

    QUnit.module('tests/events');
    QUnit.test('end event should fire after runloop completes', function (assert) {
        assert.expect(3);
        var callNumber = 0;
        var bb = new Backburner__default(['one', 'two']);
        bb.on('end', function () { return callNumber++; });
        function funcOne() {
            assert.equal(callNumber, 0);
        }
        function funcTwo() {
            assert.equal(callNumber, 0);
        }
        bb.run(function () {
            bb.schedule('one', null, funcOne);
            bb.schedule('two', null, funcTwo);
        });
        assert.equal(callNumber, 1);
    });
    QUnit.test('end event should fire before onEnd', function (assert) {
        assert.expect(3);
        var callNumber = 0;
        var bb = new Backburner__default(['one', 'two'], {
            onEnd: function onEnd() {
                assert.equal(callNumber, 1);
            }
        });
        bb.on('end', function () { return callNumber++; });
        function funcOne() {
            assert.equal(callNumber, 0);
        }
        function funcTwo() {
            assert.equal(callNumber, 0);
        }
        bb.run(function () {
            bb.schedule('one', null, funcOne);
            bb.schedule('two', null, funcTwo);
        });
    });
    QUnit.test('end event should be passed the current and next instance', function (assert) {
        assert.expect(4);
        var firstArgument = null;
        var secondArgument = null;
        var bb = new Backburner__default(['one'], {
            onEnd: function onEnd(first, second) {
                assert.equal(firstArgument, first);
                assert.equal(secondArgument, second);
            }
        });
        bb.on('end', function (first, second) {
            firstArgument = first;
            secondArgument = second;
        });
        bb.run(function () { return bb.schedule('one', null, function () { }); });
        bb.run(function () { return bb.schedule('one', null, function () { }); });
    });
    // blah
    QUnit.test('begin event should fire before runloop begins', function (assert) {
        assert.expect(4);
        var callNumber = 0;
        var bb = new Backburner__default(['one', 'two']);
        bb.on('begin', function () { return callNumber++; });
        function funcOne() {
            assert.equal(callNumber, 1);
        }
        function funcTwo() {
            assert.equal(callNumber, 1);
        }
        assert.equal(callNumber, 0);
        bb.run(function () {
            bb.schedule('one', null, funcOne);
            bb.schedule('two', null, funcTwo);
        });
        assert.equal(callNumber, 1);
    });
    QUnit.test('begin event should fire before onBegin', function (assert) {
        assert.expect(1);
        var callNumber = 0;
        var bb = new Backburner__default(['one', 'two'], {
            onBegin: function onBegin() {
                assert.equal(callNumber, 1);
            }
        });
        bb.on('begin', function () { return callNumber++; });
        bb.run(function () {
            bb.schedule('one', null, function () { });
            bb.schedule('two', null, function () { });
        });
    });
    QUnit.test('begin event should be passed the current and previous instance', function (assert) {
        assert.expect(4);
        var firstArgument = null;
        var secondArgument = null;
        var bb = new Backburner__default(['one'], {
            onBegin: function onBegin(first, second) {
                assert.equal(firstArgument, first);
                assert.equal(secondArgument, second);
            }
        });
        bb.on('begin', function (first, second) {
            firstArgument = first;
            secondArgument = second;
        });
        bb.run(function () { return bb.schedule('one', null, function () { }); });
        bb.run(function () { return bb.schedule('one', null, function () { }); });
    });
    // blah
    QUnit.test('events should work with multiple callbacks', function (assert) {
        assert.expect(2);
        var firstCalled = false;
        var secondCalled = false;
        var bb = new Backburner__default(['one']);
        function first() {
            firstCalled = true;
        }
        function second() {
            secondCalled = true;
        }
        bb.on('end', first);
        bb.on('end', second);
        bb.run(function () { return bb.schedule('one', null, function () { }); });
        assert.equal(secondCalled, true);
        assert.equal(firstCalled, true);
    });
    QUnit.test('off should unregister specific callback', function (assert) {
        assert.expect(2);
        var firstCalled = false;
        var secondCalled = false;
        var bb = new Backburner__default(['one']);
        function first() {
            firstCalled = true;
        }
        function second() {
            secondCalled = true;
        }
        bb.on('end', first);
        bb.on('end', second);
        bb.off('end', first);
        bb.run(function () { return bb.schedule('one', null, function () { }); });
        assert.equal(secondCalled, true);
        assert.equal(firstCalled, false);
    });

    QUnit.module('tests/join');
    function depth(bb) {
        return bb.instanceStack.length + (bb.currentInstance ? 1 : 0);
    }
    QUnit.test('outside of a run loop', function (assert) {
        assert.expect(4);
        var bb = new Backburner__default(['one']);
        assert.equal(depth(bb), 0);
        var result = bb.join(function () {
            assert.equal(depth(bb), 1);
            return 'result';
        });
        assert.equal(result, 'result');
        assert.equal(depth(bb), 0);
    });
    QUnit.test('inside of a run loop', function (assert) {
        assert.expect(4);
        var bb = new Backburner__default(['one']);
        assert.equal(depth(bb), 0);
        bb.run(function () {
            var result = bb.join(function () {
                assert.equal(depth(bb), 1);
                return 'result';
            });
            assert.equal(result, 'result');
        });
        assert.equal(depth(bb), 0);
    });
    QUnit.test('nested join calls', function (assert) {
        assert.expect(7);
        var bb = new Backburner__default(['one']);
        assert.equal(depth(bb), 0);
        bb.join(function () {
            assert.equal(depth(bb), 1);
            bb.join(function () {
                assert.equal(depth(bb), 1);
                bb.join(function () {
                    assert.equal(depth(bb), 1);
                });
                assert.equal(depth(bb), 1);
            });
            assert.equal(depth(bb), 1);
        });
        assert.equal(depth(bb), 0);
    });
    QUnit.test('nested run loops', function (assert) {
        assert.expect(7);
        var bb = new Backburner__default(['one']);
        assert.equal(depth(bb), 0);
        bb.join(function () {
            assert.equal(depth(bb), 1);
            bb.run(function () {
                assert.equal(depth(bb), 2);
                bb.join(function () {
                    assert.equal(depth(bb), 2);
                });
                assert.equal(depth(bb), 2);
            });
            assert.equal(depth(bb), 1);
        });
        assert.equal(depth(bb), 0);
    });
    QUnit.test('queue execution order', function (assert) {
        assert.expect(1);
        var bb = new Backburner__default(['one']);
        var items = [];
        bb.run(function () {
            items.push(0);
            bb.schedule('one', function () { return items.push(4); });
            bb.join(function () {
                items.push(1);
                bb.schedule('one', function () { return items.push(5); });
                items.push(2);
            });
            bb.schedule('one', function () { return items.push(6); });
            items.push(3);
        });
        assert.deepEqual(items, [0, 1, 2, 3, 4, 5, 6]);
    });
    QUnit.test('without an onError run.join can be caught via `try`/`catch`', function (assert) {
        assert.expect(1);
        var bb = new Backburner__default(['errors']);
        assert.throws(function () {
            bb.join(function () {
                throw new Error('test error');
            });
        }, /test error/);
    });
    QUnit.test('with an onError which does not rethrow, when joining existing instance, can be caught via `try`/`catch`', function (assert) {
        assert.expect(1);
        var bb = new Backburner__default(['errors'], {
            onError: function onError(error) {
                assert.notOk(true, 'onError should not be called as the error from .join is handled by assert.throws');
            }
        });
        bb.run(function () {
            assert.throws(function () {
                bb.join(function () {
                    throw new Error('test error');
                });
            }, /test error/, 'error from within .join can be caught with try/catch');
        });
    });
    QUnit.test('onError which does not rethrow is invoked (only once) when not joining an existing instance', function (assert) {
        assert.expect(1);
        function onError(error) {
            assert.equal('test error', error.message);
        }
        var bb = new Backburner__default(['errors'], {
            onError: onError
        });
        bb.join(function () {
            throw new Error('test error');
        });
    });
    QUnit.test('onError which does not rethrow is invoked (only once) when joining an existing instance', function (assert) {
        assert.expect(1);
        function onError(error) {
            assert.equal('test error', error.message);
        }
        var bb = new Backburner__default(['errors'], {
            onError: onError
        });
        bb.run(function () {
            bb.join(function () {
                throw new Error('test error');
            });
        });
    });
    QUnit.test('onError which does rethrow is invoked (only once) when not joining an existing instance', function (assert) {
        assert.expect(2);
        function onError(error) {
            assert.equal('test error', error.message);
            throw error;
        }
        var bb = new Backburner__default(['errors'], {
            onError: onError
        });
        assert.throws(function () {
            bb.join(function () {
                throw new Error('test error');
            });
        }, /test error/);
    });
    QUnit.test('onError which does rethrow is invoked (only once) when joining an existing instance', function (assert) {
        assert.expect(2);
        function onError(error) {
            assert.equal('test error', error.message);
            throw error;
        }
        var bb = new Backburner__default(['errors'], {
            onError: onError
        });
        assert.throws(function () {
            bb.run(function () {
                bb.join(function () {
                    throw new Error('test error');
                });
            });
        }, /test error/);
    });
    QUnit.test('when [callback, string] args passed', function (assert) {
        assert.expect(2);
        var bb = new Backburner__default(['one']);
        var functionWasCalled = false;
        bb.join(function (name) {
            assert.equal(name, 'batman');
            functionWasCalled = true;
        }, 'batman');
        assert.ok(functionWasCalled, 'function was called');
    });

    QUnit.module('tests/multi-turn');
    var platform;
    function buildFakePlatform(flush) {
        platform = Backburner.buildPlatform(flush);
        platform.flushSync = function () {
            flush();
        };
        return platform;
    }
    QUnit.test('basic', function (assert) {
        var bb = new Backburner__default(['zomg'], {
            // This is just a place holder for now, but somehow the system needs to
            // know to when to stop
            mustYield: function mustYield() {
                return true; // yield after each step, for now.
            },
            _buildPlatform: buildFakePlatform
        });
        var order = -1;
        var tasks = {
            one: { count: 0, order: -1 },
            two: { count: 0, order: -1 },
            three: { count: 0, order: -1 }
        };
        bb.schedule('zomg', null, function () {
            tasks.one.count++;
            tasks.one.order = ++order;
        });
        bb.schedule('zomg', null, function () {
            tasks.two.count++;
            tasks.two.order = ++order;
        });
        bb.schedule('zomg', null, function () {
            tasks.three.count++;
            tasks.three.order = ++order;
        });
        assert.deepEqual(tasks, {
            one: { count: 0, order: -1 },
            two: { count: 0, order: -1 },
            three: { count: 0, order: -1 }
        }, 'no tasks have been run before the platform flushes');
        platform.flushSync();
        assert.deepEqual(tasks, {
            one: { count: 1, order: 0 },
            two: { count: 0, order: -1 },
            three: { count: 0, order: -1 }
        }, 'TaskOne has been run before the platform flushes');
        platform.flushSync();
        assert.deepEqual(tasks, {
            one: { count: 1, order: 0 },
            two: { count: 1, order: 1 },
            three: { count: 0, order: -1 }
        }, 'TaskOne and TaskTwo has been run before the platform flushes');
        platform.flushSync();
        assert.deepEqual(tasks, {
            one: { count: 1, order: 0 },
            two: { count: 1, order: 1 },
            three: { count: 1, order: 2 }
        }, 'TaskOne, TaskTwo and TaskThree has been run before the platform flushes');
    });
    QUnit.test('properly cancel items which are added during flush', function (assert) {
        var bb = new Backburner__default(['zomg'], {
            // This is just a place holder for now, but somehow the system needs to
            // know to when to stop
            mustYield: function mustYield() {
                return true; // yield after each step, for now.
            },
            _buildPlatform: buildFakePlatform
        });
        var fooCalled = 0;
        var barCalled = 0;
        var obj1 = {
            foo: function foo() {
                fooCalled++;
            }
        };
        var obj2 = {
            bar: function bar() {
                barCalled++;
            }
        };
        bb.scheduleOnce('zomg', obj1, 'foo');
        bb.scheduleOnce('zomg', obj1, 'foo');
        bb.scheduleOnce('zomg', obj2, 'bar');
        bb.scheduleOnce('zomg', obj2, 'bar');
        platform.flushSync();
        var timer1 = bb.scheduleOnce('zomg', obj1, 'foo');
        var timer2 = bb.scheduleOnce('zomg', obj2, 'bar');
        bb.cancel(timer1);
        bb.cancel(timer2);
        platform.flushSync();
        platform.flushSync();
        platform.flushSync();
        assert.equal(fooCalled, 1, 'fooCalled');
        assert.equal(barCalled, 1, 'barCalled');
    });

    var Queue = Backburner__default.Queue;
    QUnit.module('tests/queue-push-unique');
    var slice = [].slice;
    QUnit.test('pushUnique: 2 different targets', function (assert) {
        var queue = new Queue('foo');
        var target1fooWasCalled = [];
        var target2fooWasCalled = [];
        var target1 = {
            foo: function foo() {
                target1fooWasCalled.push(slice.call(arguments));
            }
        };
        var target2 = {
            foo: function foo() {
                target2fooWasCalled.push(slice.call(arguments));
            }
        };
        queue.pushUnique(target1, target1.foo, ['a']);
        queue.pushUnique(target2, target2.foo, ['b']);
        assert.deepEqual(target1fooWasCalled, []);
        assert.deepEqual(target2fooWasCalled, []);
        queue.flush();
        assert.deepEqual(target1fooWasCalled.length, 1, 'expected: target 1.foo to be called only once');
        assert.deepEqual(target1fooWasCalled[0], ['a']);
        assert.deepEqual(target2fooWasCalled.length, 1, 'expected: target 2.foo to be called only once');
        assert.deepEqual(target2fooWasCalled[0], ['b']);
    });
    QUnit.test('pushUnique: 1 target, 2 different methods', function (assert) {
        var queue = new Queue('foo');
        var target1fooWasCalled = [];
        var target1barWasCalled = [];
        var target1 = {
            foo: function () {
                target1fooWasCalled.push(slice.call(arguments));
            },
            bar: function () {
                target1barWasCalled.push(slice.call(arguments));
            }
        };
        queue.pushUnique(target1, target1.foo, ['a']);
        queue.pushUnique(target1, target1.bar, ['b']);
        assert.deepEqual(target1fooWasCalled, []);
        assert.deepEqual(target1barWasCalled, []);
        queue.flush();
        assert.deepEqual(target1fooWasCalled.length, 1, 'expected: target 1.foo to be called only once');
        assert.deepEqual(target1fooWasCalled[0], ['a']);
        assert.deepEqual(target1barWasCalled.length, 1, 'expected: target 1.bar to be called only once');
        assert.deepEqual(target1barWasCalled[0], ['b']);
    });
    QUnit.test('pushUnique: 1 target, 1 different methods called twice', function (assert) {
        var queue = new Queue('foo');
        var target1fooWasCalled = [];
        var target1 = {
            foo: function () {
                target1fooWasCalled.push(slice.call(arguments));
            }
        };
        queue.pushUnique(target1, target1.foo, ['a']);
        queue.pushUnique(target1, target1.foo, ['b']);
        assert.deepEqual(target1fooWasCalled, []);
        queue.flush();
        assert.deepEqual(target1fooWasCalled.length, 1, 'expected: target 1.foo to be called only once');
        assert.deepEqual(target1fooWasCalled[0], ['b']);
    });
    QUnit.test('pushUnique: 2 different targets', function (assert) {
        var queue = new Queue('foo', {});
        var target1fooWasCalled = [];
        var target2fooWasCalled = [];
        var target1 = {
            foo: function () {
                target1fooWasCalled.push(slice.call(arguments));
            }
        };
        var target2 = {
            foo: function () {
                target2fooWasCalled.push(slice.call(arguments));
            }
        };
        queue.pushUnique(target1, target1.foo, ['a']);
        queue.pushUnique(target2, target2.foo, ['b']);
        assert.deepEqual(target1fooWasCalled, []);
        assert.deepEqual(target2fooWasCalled, []);
        queue.flush();
        assert.deepEqual(target1fooWasCalled.length, 1, 'expected: target 1.foo to be called only once');
        assert.deepEqual(target1fooWasCalled[0], ['a']);
        assert.deepEqual(target2fooWasCalled.length, 1, 'expected: target 2.foo to be called only once');
        assert.deepEqual(target2fooWasCalled[0], ['b']);
    });
    QUnit.test('pushUnique: 1 target, 2 different methods', function (assert) {
        var queue = new Queue('foo', {});
        var target1fooWasCalled = [];
        var target1barWasCalled = [];
        var target1 = {
            foo: function () {
                target1fooWasCalled.push(slice.call(arguments));
            },
            bar: function () {
                target1barWasCalled.push(slice.call(arguments));
            }
        };
        queue.pushUnique(target1, target1.foo, ['a']);
        queue.pushUnique(target1, target1.bar, ['b']);
        assert.deepEqual(target1fooWasCalled, []);
        assert.deepEqual(target1barWasCalled, []);
        queue.flush();
        assert.deepEqual(target1fooWasCalled.length, 1, 'expected: target 1.foo to be called only once');
        assert.deepEqual(target1fooWasCalled[0], ['a']);
        assert.deepEqual(target1barWasCalled.length, 1, 'expected: target 1.bar to be called only once');
        assert.deepEqual(target1barWasCalled[0], ['b']);
    });
    QUnit.test('pushUnique: 1 target, 1 diffe`rent methods called twice', function (assert) {
        var queue = new Queue('foo', {});
        var target1fooWasCalled = [];
        var target1 = {
            foo: function () {
                target1fooWasCalled.push(slice.call(arguments));
            }
        };
        queue.pushUnique(target1, target1.foo, ['a']);
        queue.pushUnique(target1, target1.foo, ['b']);
        assert.deepEqual(target1fooWasCalled, []);
        queue.flush();
        assert.deepEqual(target1fooWasCalled.length, 1, 'expected: target 1.foo to be called only once');
        assert.deepEqual(target1fooWasCalled[0], ['b']);
    });
    QUnit.test('pushUnique: 1 target, 2 different methods, second one called twice', function (assert) {
        var queue = new Queue('foo', {});
        var target1barWasCalled = [];
        var target1 = {
            foo: function () {
            },
            bar: function () {
                target1barWasCalled.push(slice.call(arguments));
            }
        };
        queue.pushUnique(target1, target1.foo);
        queue.pushUnique(target1, target1.bar, ['a']);
        queue.pushUnique(target1, target1.bar, ['b']);
        assert.deepEqual(target1barWasCalled, []);
        queue.flush();
        assert.deepEqual(target1barWasCalled.length, 1, 'expected: target 1.bar to be called only once');
    });
    QUnit.test('pushUnique: 2 different targets', function (assert) {
        var queue = new Queue('foo', {});
        var target1fooWasCalled = [];
        var target2fooWasCalled = [];
        var target1 = {
            foo: function () {
                target1fooWasCalled.push(slice.call(arguments));
            }
        };
        var target2 = {
            foo: function () {
                target2fooWasCalled.push(slice.call(arguments));
            }
        };
        queue.pushUnique(target1, target1.foo, ['a']);
        queue.pushUnique(target2, target2.foo, ['b']);
        assert.deepEqual(target1fooWasCalled, []);
        assert.deepEqual(target2fooWasCalled, []);
        queue.flush();
        assert.deepEqual(target1fooWasCalled.length, 1, 'expected: target 1.foo to be called only once');
        assert.deepEqual(target1fooWasCalled[0], ['a']);
        assert.deepEqual(target2fooWasCalled.length, 1, 'expected: target 2.foo to be called only once');
        assert.deepEqual(target2fooWasCalled[0], ['b']);
    });
    QUnit.test('pushUnique: 1 target, 2 different methods', function (assert) {
        var queue = new Queue('foo', {});
        var target1fooWasCalled = [];
        var target1barWasCalled = [];
        var target1 = {
            foo: function () {
                target1fooWasCalled.push(slice.call(arguments));
            },
            bar: function () {
                target1barWasCalled.push(slice.call(arguments));
            }
        };
        queue.pushUnique(target1, target1.foo, ['a']);
        queue.pushUnique(target1, target1.bar, ['b']);
        assert.deepEqual(target1fooWasCalled, []);
        assert.deepEqual(target1barWasCalled, []);
        queue.flush();
        assert.deepEqual(target1fooWasCalled.length, 1, 'expected: target 1.foo to be called only once');
        assert.deepEqual(target1fooWasCalled[0], ['a']);
        assert.deepEqual(target1barWasCalled.length, 1, 'expected: target 1.bar to be called only once');
        assert.deepEqual(target1barWasCalled[0], ['b']);
    });
    QUnit.test('pushUnique: 1 target, 1 different methods called twice', function (assert) {
        var queue = new Queue('foo', {});
        var target1fooWasCalled = [];
        var target1 = {
            foo: function () {
                target1fooWasCalled.push(slice.call(arguments));
            }
        };
        queue.pushUnique(target1, target1.foo, ['a']);
        queue.pushUnique(target1, target1.foo, ['b']);
        assert.deepEqual(target1fooWasCalled, []);
        queue.flush();
        assert.deepEqual(target1fooWasCalled.length, 1, 'expected: target 1.foo to be called only once');
        assert.deepEqual(target1fooWasCalled[0], ['b']);
    });
    QUnit.test('pushUnique: 1 target, 2 different methods, second one called twice', function (assert) {
        var queue = new Queue('foo', {});
        var target1barWasCalled = [];
        var target1 = {
            foo: function () {
            },
            bar: function () {
                target1barWasCalled.push(slice.call(arguments));
            }
        };
        queue.pushUnique(target1, target1.foo);
        queue.pushUnique(target1, target1.bar, ['a']);
        queue.pushUnique(target1, target1.bar, ['b']);
        assert.deepEqual(target1barWasCalled, []);
        queue.flush();
        assert.equal(target1barWasCalled.length, 1, 'expected: target 1.bar to be called only once');
    });
    QUnit.test('can cancel property', function (assert) {
        var queue = new Queue('foo', {});
        var target1fooWasCalled = 0;
        var target2fooWasCalled = 0;
        var target1 = {
            foo: function () {
                target1fooWasCalled++;
            }
        };
        var target2 = {
            foo: function () {
                target2fooWasCalled++;
            }
        };
        var timer1 = queue.pushUnique(target1, target1.foo);
        var timer2 = queue.pushUnique(target2, target2.foo);
        queue.cancel(timer2);
        queue.cancel(timer1);
        queue.pushUnique(target1, target1.foo);
        queue.pushUnique(target1, target1.foo);
        queue.pushUnique(target2, target2.foo);
        queue.pushUnique(target2, target2.foo);
        queue.flush();
        assert.equal(target1fooWasCalled, 1);
        assert.equal(target2fooWasCalled, 1);
    });
    QUnit.test('pushUnique: 1 target, 1 method called twice, canceled 2 call', function (assert) {
        var queue = new Queue('foo');
        var invocationArgs = [];
        var target1 = {
            foo: function () {
                invocationArgs.push.apply(invocationArgs, arguments);
            }
        };
        queue.pushUnique(target1, target1.foo, ['a']);
        var timer = queue.pushUnique(target1, target1.foo, ['b']);
        assert.deepEqual(invocationArgs, [], 'precond - empty initially');
        queue.cancel(timer);
        queue.flush();
        assert.deepEqual(invocationArgs, [], 'still has not been invoked');
    });

    QUnit.module('tests/queue');
    QUnit.test('actions scheduled on previous queue, start over from beginning', function (assert) {
        assert.expect(5);
        var bb = new Backburner__default(['one', 'two']);
        var step = 0;
        bb.run(function () {
            assert.equal(step++, 0, '0');
            bb.schedule('two', null, function () {
                assert.equal(step++, 1, '1');
                bb.schedule('one', null, function () {
                    assert.equal(step++, 3, '3');
                });
            });
            bb.schedule('two', null, function () {
                assert.equal(step++, 2, '2');
            });
        });
        assert.equal(step, 4, '4');
    });
    QUnit.test('Queue#flush should be recursive if new items are added', function (assert) {
        assert.expect(2);
        var bb = new Backburner__default(['one']);
        var count = 0;
        bb.run(function () {
            function increment() {
                if (++count < 3) {
                    bb.schedule('one', increment);
                }
                if (count === 3) {
                    bb.schedule('one', increment);
                }
            }
            increment();
            assert.equal(count, 1, 'should not have run yet');
            var currentInstance = bb.currentInstance;
            if (currentInstance) {
                currentInstance.queues.one.flush();
            }
            assert.equal(count, 4, 'should have run all scheduled methods, even ones added during flush');
        });
    });
    QUnit.test('Default queue is automatically set to first queue if none is provided', function (assert) {
        var bb = new Backburner__default(['one', 'two']);
        assert.equal(bb.defaultQueue, 'one');
    });
    QUnit.test('Default queue can be manually configured', function (assert) {
        var bb = new Backburner__default(['one', 'two'], {
            defaultQueue: 'two'
        });
        assert.equal(bb.defaultQueue, 'two');
    });
    QUnit.test('onBegin and onEnd are called and passed the correct parameters', function (assert) {
        assert.expect(2);
        var befores = [];
        var afters = [];
        var expectedBefores = [];
        var expectedAfters = [];
        var outer;
        var inner;
        var bb = new Backburner__default(['one'], {
            onBegin: function (current, previous) {
                befores.push(current);
                befores.push(previous);
            },
            onEnd: function (current, next) {
                afters.push(current);
                afters.push(next);
            }
        });
        bb.run(function () {
            outer = bb.currentInstance;
            bb.run(function () {
                inner = bb.currentInstance;
            });
        });
        expectedBefores = [outer, null, inner, outer];
        expectedAfters = [inner, outer, outer, null];
        assert.deepEqual(befores, expectedBefores, 'before callbacks successful');
        assert.deepEqual(afters, expectedAfters, 'after callback successful');
    });

    QUnit.module('tests/run');
    QUnit.test('when passed a function', function (assert) {
        assert.expect(1);
        var bb = new Backburner__default(['one']);
        var functionWasCalled = false;
        bb.run(function () { return functionWasCalled = true; });
        assert.ok(functionWasCalled, 'function was called');
    });
    QUnit.test('when passed a target and method', function (assert) {
        assert.expect(2);
        var bb = new Backburner__default(['one']);
        var functionWasCalled = false;
        bb.run({ zomg: 'hi' }, function () {
            assert.equal(this.zomg, 'hi', 'the target was properly set');
            functionWasCalled = true;
        });
        assert.ok(functionWasCalled, 'function was called');
    });
    QUnit.test('when passed a target, method, and arguments', function (assert) {
        assert.expect(5);
        var bb = new Backburner__default(['one']);
        var functionWasCalled = false;
        bb.run({ zomg: 'hi' }, function (a, b, c) {
            assert.equal(this.zomg, 'hi', 'the target was properly set');
            assert.equal(a, 1, 'the first arguments was passed in');
            assert.equal(b, 2, 'the second arguments was passed in');
            assert.equal(c, 3, 'the third arguments was passed in');
            functionWasCalled = true;
        }, 1, 2, 3);
        assert.ok(functionWasCalled, 'function was called');
    });
    QUnit.test('nesting run loops preserves the stack', function (assert) {
        assert.expect(10);
        var bb = new Backburner__default(['one']);
        var outerBeforeFunctionWasCalled = false;
        var middleBeforeFunctionWasCalled = false;
        var innerFunctionWasCalled = false;
        var middleAfterFunctionWasCalled = false;
        var outerAfterFunctionWasCalled = false;
        bb.run(function () {
            bb.schedule('one', function () {
                outerBeforeFunctionWasCalled = true;
            });
            bb.run(function () {
                bb.schedule('one', function () {
                    middleBeforeFunctionWasCalled = true;
                });
                bb.run(function () {
                    bb.schedule('one', function () {
                        innerFunctionWasCalled = true;
                    });
                    assert.ok(!innerFunctionWasCalled, 'function is deferred');
                });
                assert.ok(innerFunctionWasCalled, 'function is called');
                bb.schedule('one', function () {
                    middleAfterFunctionWasCalled = true;
                });
                assert.ok(!middleBeforeFunctionWasCalled, 'function is deferred');
                assert.ok(!middleAfterFunctionWasCalled, 'function is deferred');
            });
            assert.ok(middleBeforeFunctionWasCalled, 'function is called');
            assert.ok(middleAfterFunctionWasCalled, 'function is called');
            bb.schedule('one', function () {
                outerAfterFunctionWasCalled = true;
            });
            assert.ok(!outerBeforeFunctionWasCalled, 'function is deferred');
            assert.ok(!outerAfterFunctionWasCalled, 'function is deferred');
        });
        assert.ok(outerBeforeFunctionWasCalled, 'function is called');
        assert.ok(outerAfterFunctionWasCalled, 'function is called');
    });
    QUnit.test('runs can be nested', function (assert) {
        assert.expect(2);
        var bb = new Backburner__default(['one']);
        var step = 0;
        bb.run(function () {
            assert.equal(step++, 0);
            bb.run(function () {
                assert.equal(step++, 1);
            });
        });
    });
    QUnit.test('run returns value', function (assert) {
        var bb = new Backburner__default(['one']);
        var value = bb.run(function () { return 'hi'; });
        assert.equal(value, 'hi');
    });
    QUnit.test('onError', function (assert) {
        assert.expect(1);
        function onError(error) {
            assert.equal('QUnit.test error', error.message);
        }
        var bb = new Backburner__default(['errors'], {
            onError: onError
        });
        bb.run(function () {
            throw new Error('QUnit.test error');
        });
    });
    QUnit.test('onError set after start', function (assert) {
        assert.expect(2);
        var bb = new Backburner__default(['errors']);
        bb.run(function () { return assert.ok(true); });
        bb.options.onError = function (error) {
            assert.equal('QUnit.test error', error.message);
        };
        bb.run(function () { throw new Error('QUnit.test error'); });
    });
    QUnit.test('onError with target and action', function (assert) {
        assert.expect(3);
        var target = {};
        var bb = new Backburner__default(['errors'], {
            onErrorTarget: target,
            onErrorMethod: 'onerror'
        });
        bb.run(function () { return assert.ok(true); });
        target['onerror'] = function (error) {
            assert.equal('QUnit.test error', error.message);
        };
        bb.run(function () { throw new Error('QUnit.test error'); });
        target['onerror'] = function () { };
        bb.run(function () { throw new Error('QUnit.test error'); });
        target['onerror'] = function (error) {
            assert.equal('QUnit.test error', error.message);
        };
        bb.run(function () { throw new Error('QUnit.test error'); });
    });
    QUnit.test('when [callback, string] args passed', function (assert) {
        assert.expect(2);
        var bb = new Backburner__default(['one']);
        var functionWasCalled = false;
        bb.run(function (name) {
            assert.equal(name, 'batman');
            functionWasCalled = true;
        }, 'batman');
        assert.ok(functionWasCalled, 'function was called');
    });

    /* tslint:disable:no-shadowed-variable*/
    var originalDateNow = Date.now;
    var originalDateValueOf$1 = Date.prototype.valueOf;
    QUnit.module('tests/set-timeout-test', {
        afterEach: function afterEach() {
            Date.now = originalDateNow;
            Date.prototype.valueOf = originalDateValueOf$1;
        }
    });
    QUnit.test('later', function (assert) {
        assert.expect(6);
        var bb = new Backburner__default(['one']);
        var step = 0;
        var instance;
        var done = assert.async();
        // Force +new Date to return the same result while scheduling
        // run.later timers. Otherwise: non-determinism!
        var now = +new Date();
        Date.prototype.valueOf = function () { return now; };
        bb.later(null, function () {
            instance = bb.currentInstance;
            assert.equal(step++, 0);
        }, 10);
        bb.later(null, function () {
            assert.equal(step++, 1);
            assert.equal(instance, bb.currentInstance, 'same instance');
        }, 10);
        Date.prototype.valueOf = originalDateValueOf$1;
        bb.later(null, function () {
            assert.equal(step++, 2);
            bb.later(null, function () {
                assert.equal(step++, 3);
                assert.ok(true, 'Another later will execute correctly');
                done();
            }, 1);
        }, 20);
    });
    QUnit.test('later should rely on stubbed `Date.now`', function (assert) {
        assert.expect(1);
        var bb = new Backburner__default(['one']);
        var done = assert.async();
        var globalNowWasUsed = false;
        Date.now = function () {
            globalNowWasUsed = true;
            return originalDateNow();
        };
        bb.later(function () {
            assert.ok(globalNowWasUsed);
            done();
        }, 1);
    });
    var bb;
    QUnit.module('later arguments / arity', {
        beforeEach: function beforeEach() {
            bb = new Backburner__default(['one']);
        },
        afterEach: function afterEach() {
            bb = undefined;
        }
    });
    QUnit.test('[callback]', function (assert) {
        assert.expect(2);
        var done = assert.async();
        bb.later(function () {
            assert.equal(arguments.length, 0);
            assert.ok(true, 'was called');
            done();
        });
    });
    QUnit.test('[callback, undefined]', function (assert) {
        assert.expect(2);
        var done = assert.async();
        bb.later(function () {
            assert.equal(arguments.length, 1);
            assert.ok(true, 'was called');
            done();
        }, undefined);
    });
    QUnit.test('[null, callback, undefined]', function (assert) {
        assert.expect(2);
        var done = assert.async();
        bb.later(null, function () {
            assert.equal(arguments.length, 0);
            assert.ok(true, 'was called');
            done();
        });
    });
    QUnit.test('[null, callback, undefined]', function (assert) {
        assert.expect(2);
        var done = assert.async();
        bb.later(null, function () {
            assert.equal(arguments.length, 1);
            assert.ok(true, 'was called');
            done();
        }, undefined);
    });
    QUnit.test('[null, callback, null]', function (assert) {
        assert.expect(3);
        var done = assert.async();
        bb.later(null, function () {
            assert.equal(arguments.length, 1);
            assert.equal(arguments[0], null);
            assert.ok(true, 'was called');
            done();
        }, null);
    });
    QUnit.test('[callback, string, string, string]', function (assert) {
        assert.expect(5);
        var done = assert.async();
        bb.later(function () {
            assert.equal(arguments.length, 3);
            assert.equal(arguments[0], 'a');
            assert.equal(arguments[1], 'b');
            assert.equal(arguments[2], 'c');
            assert.ok(true, 'was called');
            done();
        }, 'a', 'b', 'c');
    });
    QUnit.test('[null, callback, string, string, string]', function (assert) {
        assert.expect(5);
        var done = assert.async();
        bb.later(null, function () {
            assert.equal(arguments.length, 3);
            assert.equal(arguments[0], 'a');
            assert.equal(arguments[1], 'b');
            assert.equal(arguments[2], 'c');
            assert.ok(true, 'was called');
            done();
        }, 'a', 'b', 'c');
    });
    QUnit.test('[null, callback, string, string, string, number]', function (assert) {
        assert.expect(5);
        var done = assert.async();
        bb.later(null, function () {
            assert.equal(arguments.length, 3);
            assert.equal(arguments[0], 'a');
            assert.equal(arguments[1], 'b');
            assert.equal(arguments[2], 'c');
            assert.ok(true, 'was called');
            done();
        }, 'a', 'b', 'c', 10);
    });
    QUnit.test('[null, callback, string, string, string, numericString]', function (assert) {
        assert.expect(5);
        var done = assert.async();
        bb.later(null, function () {
            assert.equal(arguments.length, 3);
            assert.equal(arguments[0], 'a');
            assert.equal(arguments[1], 'b');
            assert.equal(arguments[2], 'c');
            assert.ok(true, 'was called');
            done();
        }, 'a', 'b', 'c', '1');
    });
    QUnit.test('[obj, string]', function (assert) {
        assert.expect(1);
        var done = assert.async();
        bb.later({
            bro: function bro() {
                assert.ok(true, 'was called');
                done();
            }
        }, 'bro');
    });
    QUnit.test('[obj, string, value]', function (assert) {
        assert.expect(3);
        var done = assert.async();
        bb.later({
            bro: function bro() {
                assert.equal(arguments.length, 1);
                assert.equal(arguments[0], 'value');
                assert.ok(true, 'was called');
                done();
            }
        }, 'bro', 'value');
    });
    QUnit.test('[obj, string, value, number]', function (assert) {
        var done = assert.async();
        bb.later({
            bro: function bro() {
                assert.equal(arguments.length, 1);
                assert.equal(arguments[0], 'value');
                assert.ok(true, 'was called');
                done();
            }
        }, 'bro', 'value', 1);
    });
    QUnit.test('[obj, string, value, numericString]', function (assert) {
        var done = assert.async();
        bb.later({
            bro: function bro() {
                assert.equal(arguments.length, 1);
                assert.equal(arguments[0], 'value');
                assert.ok(true, 'was called');
                done();
            }
        }, 'bro', 'value', '1');
    });
    QUnit.test('onError', function (assert) {
        assert.expect(1);
        var done = assert.async();
        function onError(error) {
            assert.equal('test error', error.message);
            done();
        }
        bb = new Backburner__default(['errors'], { onError: onError });
        bb.later(function () { throw new Error('test error'); }, 1);
    });
    QUnit.test('later doesn\'t trigger twice with earlier later', function (assert) {
        assert.expect(4);
        bb = new Backburner__default(['one']);
        var called1 = 0;
        var called2 = 0;
        var beginCalls = 0;
        var endCalls = 0;
        var oldBegin = bb.begin;
        var oldEnd = bb.end;
        var done = assert.async();
        bb.begin = function () {
            beginCalls++;
            oldBegin.call(bb);
        };
        bb.end = function () {
            endCalls++;
            oldEnd.call(bb);
        };
        bb.later(function () { return called1++; }, 50);
        bb.later(function () { return called2++; }, 10);
        setTimeout(function () {
            assert.equal(called1, 1, 'timeout 1 was called once');
            assert.equal(called2, 1, 'timeout 2 was called once');
            assert.equal(beginCalls, 2, 'begin() was called twice');
            assert.equal(endCalls, 2, 'end() was called twice');
            done();
        }, 100);
    });
    QUnit.test('later with two Backburner instances', function (assert) {
        assert.expect(8);
        var steps = 0;
        var done = assert.async();
        var bb1 = new Backburner__default(['one'], {
            onBegin: function onBegin() {
                assert.equal(++steps, 4);
            }
        });
        var bb2 = new Backburner__default(['one'], {
            onBegin: function onBegin() {
                assert.equal(++steps, 6);
            }
        });
        assert.equal(++steps, 1);
        bb1.later(function () { return assert.equal(++steps, 5); }, 10);
        assert.equal(++steps, 2);
        bb2.later(function () { return assert.equal(++steps, 7); }, 10);
        assert.equal(++steps, 3);
        setTimeout(function () {
            assert.equal(++steps, 8);
            done();
        }, 50);
    });
    QUnit.test('expired timeout doesn\'t hang when setting a new timeout', function (assert) {
        assert.expect(3);
        var called1At = 0;
        var called2At = 0;
        var done = assert.async();
        bb.later(function () { return called1At = Date.now(); }, 1);
        bb.later(function () { return called2At = Date.now(); }, 50);
        setTimeout(function () {
            assert.ok(called1At !== 0, 'timeout 1 was called');
            assert.ok(called2At !== 0, 'timeout 2 was called');
            assert.ok(called2At - called1At > 10, 'timeout 1 did not wait for timeout 2');
            done();
        }, 60);
    });
    QUnit.test('NaN timeout doesn\'t hang other timeouts', function (assert) {
        assert.expect(2);
        var done = assert.async();
        var called1At = 0;
        var called2At = 0;
        bb.later(function () { return called1At = Date.now(); }, 1);
        bb.later(function () { }, NaN);
        bb.later(function () { return called2At = Date.now(); }, 10);
        setTimeout(function () {
            assert.ok(called1At !== 0, 'timeout 1 was called');
            assert.ok(called2At !== 0, 'timeout 2 was called');
            done();
        }, 20);
    });
    QUnit.test('when [callback, string] args passed', function (assert) {
        assert.expect(1);
        var done = assert.async();
        var bb = new Backburner__default(['one']);
        bb.later(function (name) {
            assert.equal(name, 'batman');
            done();
        }, 'batman', 0);
    });

    QUnit.module('tests/throttle');
    QUnit.test('throttle', function (assert) {
        assert.expect(18);
        var bb = new Backburner__default(['zomg']);
        var step = 0;
        var done = assert.async();
        var wasCalled = false;
        function throttler() {
            assert.ok(!wasCalled);
            wasCalled = true;
        }
        // let's throttle the function `throttler` for 40ms
        // it will be executed in 40ms
        bb.throttle(null, throttler, 40, false);
        assert.equal(step++, 0);
        // let's schedule `throttler` to run in 10ms
        setTimeout(function () {
            assert.equal(step++, 1);
            assert.ok(!wasCalled);
            bb.throttle(null, throttler, false);
        }, 10);
        // let's schedule `throttler` to run again in 20ms
        setTimeout(function () {
            assert.equal(step++, 2);
            assert.ok(!wasCalled);
            bb.throttle(null, throttler, false);
        }, 20);
        // let's schedule `throttler` to run yet again in 30ms
        setTimeout(function () {
            assert.equal(step++, 3);
            assert.ok(!wasCalled);
            bb.throttle(null, throttler, false);
        }, 30);
        // at 40ms, `throttler` will get called once
        // now, let's schedule an assertion to occur at 50ms,
        // 10ms after `throttler` has been called
        setTimeout(function () {
            assert.equal(step++, 4);
            assert.ok(wasCalled);
        }, 50);
        // great, we've made it this far, there's one more thing
        // we need to test. we want to make sure we can call `throttle`
        // again with the same target/method after it has executed
        // at the 60ms mark, let's schedule another call to `throttle`
        setTimeout(function () {
            wasCalled = false; // reset the flag
            // assert call order
            assert.equal(step++, 5);
            // call throttle for the second time
            bb.throttle(null, throttler, 100, false);
            // assert that it is called in the future and not blackholed
            setTimeout(function () {
                assert.equal(step++, 6);
                assert.ok(wasCalled, 'Another throttle call with the same function can be executed later');
            }, 110);
        }, 60);
        setTimeout(function () {
            wasCalled = false; // reset the flag
            // assert call order
            assert.equal(step++, 7);
            // call throttle again that time using a string number like time interval
            bb.throttle(null, throttler, '100', false);
            // assert that it is called in the future and not blackholed
            setTimeout(function () {
                assert.equal(step++, 8);
                assert.ok(wasCalled, 'Throttle accept a string number like time interval');
                done();
            }, 110);
        }, 180);
    });
    QUnit.test('throttle with cancelTimers', function (assert) {
        assert.expect(1);
        var count = 0;
        var bb = new Backburner__default(['zomg']);
        // Throttle a no-op 10ms
        bb.throttle(null, function () { }, 10, false);
        try {
            bb.cancelTimers();
        }
        catch (e) {
            count++;
        }
        assert.equal(count, 0, 'calling cancelTimers while something is being throttled does not throw an error');
    });
    QUnit.test('throttled function is called with final argument', function (assert) {
        assert.expect(1);
        var done = assert.async();
        var bb = new Backburner__default(['zomg']);
        function throttled(arg) {
            assert.equal(arg, 'bus');
            done();
        }
        bb.throttle(null, throttled, 'car', 10, false);
        bb.throttle(null, throttled, 'bicycle', 10, false);
        bb.throttle(null, throttled, 'bus', 10, false);
    });
    QUnit.test('throttle returns same timer', function (assert) {
        assert.expect(2);
        var bb = new Backburner__default(['joker']);
        function throttled1() { }
        function throttled2() { }
        var timer1 = bb.throttle(null, throttled1, 10);
        var timer2 = bb.throttle(null, throttled2, 10);
        var timer3 = bb.throttle(null, throttled1, 10);
        var timer4 = bb.throttle(null, throttled2, 10);
        assert.equal(timer1, timer3);
        assert.equal(timer2, timer4);
    });
    QUnit.test('throttle leading edge', function (assert) {
        assert.expect(10);
        var bb = new Backburner__default(['zerg']);
        var throttle;
        var throttle2;
        var wasCalled = false;
        var done = assert.async();
        function throttler() {
            assert.ok(!wasCalled, 'throttler hasn\'t been called yet');
            wasCalled = true;
        }
        // let's throttle the function `throttler` for 40ms
        // it will be executed immediately, but throttled for the future hits
        throttle = bb.throttle(null, throttler, 40);
        assert.ok(wasCalled, 'function was executed immediately');
        wasCalled = false;
        // let's schedule `throttler` to run again, it shouldn't be allowed to queue for another 40 msec
        throttle2 = bb.throttle(null, throttler, 40);
        assert.equal(throttle, throttle2, 'No new throttle was inserted, returns old throttle');
        setTimeout(function () {
            assert.ok(!wasCalled, 'attempt to call throttle again didn\'t happen');
            throttle = bb.throttle(null, throttler, 40);
            assert.ok(wasCalled, 'newly inserted throttle after timeout functioned');
            assert.ok(bb.cancel(throttle), 'wait time of throttle was cancelled');
            wasCalled = false;
            throttle2 = bb.throttle(null, throttler, 40);
            assert.notEqual(throttle, throttle2, 'the throttle is different');
            assert.ok(wasCalled, 'throttle was inserted and run immediately after cancel');
            done();
        }, 60);
    });
    QUnit.test('throttle returns timer information usable for cancelling', function (assert) {
        assert.expect(3);
        var done = assert.async();
        var bb = new Backburner__default(['batman']);
        var wasCalled = false;
        function throttler() {
            assert.ok(false, 'this method shouldn\'t be called');
            wasCalled = true;
        }
        var timer = bb.throttle(null, throttler, 1, false);
        assert.ok(bb.cancel(timer), 'the timer is cancelled');
        // should return false second time around
        assert.ok(!bb.cancel(timer), 'the timer no longer exists in the list');
        setTimeout(function () {
            assert.ok(!wasCalled, 'the timer wasn\'t called after waiting');
            done();
        }, 60);
    });
    QUnit.test('throttler cancel after it\'s executed returns false', function (assert) {
        assert.expect(3);
        var bb = new Backburner__default(['darkknight']);
        var done = assert.async();
        var wasCalled = false;
        function throttler() {
            assert.ok(true, 'the throttled method was called');
            wasCalled = true;
        }
        var timer = bb.throttle(null, throttler, 1);
        setTimeout(function () {
            assert.ok(!bb.cancel(timer), 'no timer existed to cancel');
            assert.ok(wasCalled, 'the timer was actually called');
            done();
        }, 10);
    });
    QUnit.test('throttler returns the appropriate timer to cancel if the old item still exists', function (assert) {
        assert.expect(5);
        var bb = new Backburner__default(['robin']);
        var wasCalled = false;
        var done = assert.async();
        function throttler() {
            assert.ok(true, 'the throttled method was called');
            wasCalled = true;
        }
        var timer = bb.throttle(null, throttler, 1);
        var timer2 = bb.throttle(null, throttler, 1);
        assert.deepEqual(timer, timer2, 'the same timer was returned');
        setTimeout(function () {
            bb.throttle(null, throttler, 1);
            assert.ok(!bb.cancel(timer), 'the second timer isn\'t removed, despite appearing to be the same item');
            assert.ok(wasCalled, 'the timer was actually called');
            done();
        }, 10);
    });
    QUnit.test('throttle without a target, without args', function (assert) {
        var done = assert.async();
        var bb = new Backburner__default(['batman']);
        var calledCount = 0;
        var calledWith = new Array();
        function throttled() {
            var args = [], len = arguments.length;
            while ( len-- ) args[ len ] = arguments[ len ];

            calledCount++;
            calledWith.push(args);
        }
        bb.throttle(throttled, 10);
        bb.throttle(throttled, 10);
        bb.throttle(throttled, 10);
        assert.equal(calledCount, 1, 'throttle method was called immediately');
        assert.deepEqual(calledWith, [[]], 'throttle method was called with the correct arguments');
        setTimeout(function () {
            bb.throttle(throttled, 10);
            assert.equal(calledCount, 1, 'throttle method was not called again within the time window');
        }, 0);
        setTimeout(function () {
            assert.equal(calledCount, 1, 'throttle method was was only called once');
            done();
        }, 20);
    });
    QUnit.test('throttle without a target, without args - can be canceled', function (assert) {
        var bb = new Backburner__default(['batman']);
        var fooCalledCount = 0;
        var barCalledCount = 0;
        function foo() {
            fooCalledCount++;
        }
        function bar() {
            barCalledCount++;
        }
        bb.throttle(foo, 10);
        bb.throttle(foo, 10);
        assert.equal(fooCalledCount, 1, 'foo was called immediately, then throttle');
        bb.throttle(bar, 10);
        var timer = bb.throttle(bar, 10);
        assert.equal(barCalledCount, 1, 'bar was called immediately, then throttle');
        bb.cancel(timer);
        bb.throttle(bar, 10);
        assert.equal(barCalledCount, 2, 'after canceling the prior throttle, bar was called again');
    });
    QUnit.test('throttle without a target, without args, not immediate', function (assert) {
        var done = assert.async();
        var bb = new Backburner__default(['batman']);
        var calledCount = 0;
        var calledWith = new Array();
        function throttled() {
            var args = [], len = arguments.length;
            while ( len-- ) args[ len ] = arguments[ len ];

            calledCount++;
            calledWith.push(args);
        }
        bb.throttle(throttled, 10, false);
        bb.throttle(throttled, 10, false);
        bb.throttle(throttled, 10, false);
        assert.equal(calledCount, 0, 'throttle method was not called immediately');
        setTimeout(function () {
            assert.equal(calledCount, 0, 'throttle method was not called in next tick');
            bb.throttle(throttled, 10, false);
        }, 0);
        setTimeout(function () {
            assert.equal(calledCount, 1, 'throttle method was was only called once');
            assert.deepEqual(calledWith, [[]], 'throttle method was called with the correct arguments');
            done();
        }, 20);
    });
    QUnit.test('throttle without a target, without args, not immediate - can be canceled', function (assert) {
        var done = assert.async();
        var bb = new Backburner__default(['batman']);
        var fooCalledCount = 0;
        var barCalledCount = 0;
        function foo() {
            fooCalledCount++;
        }
        function bar() {
            barCalledCount++;
        }
        bb.throttle(foo, 10, false);
        bb.throttle(foo, 10, false);
        assert.equal(fooCalledCount, 0, 'foo was not called immediately');
        bb.throttle(bar, 10, false);
        var timer = bb.throttle(bar, 10, false);
        assert.equal(barCalledCount, 0, 'bar was not called immediately');
        setTimeout(function () {
            assert.equal(fooCalledCount, 0, 'foo was not called within the time window');
            assert.equal(barCalledCount, 0, 'bar was not called within the time window');
            bb.cancel(timer);
        }, 0);
        setTimeout(function () {
            assert.equal(fooCalledCount, 1, 'foo ran');
            assert.equal(barCalledCount, 0, 'bar was properly canceled');
            bb.throttle(bar, 10, false);
            setTimeout(function () {
                assert.equal(barCalledCount, 1, 'bar was able to run after being canceled');
                done();
            }, 20);
        }, 20);
    });
    QUnit.test('throttle without a target, with args', function (assert) {
        var bb = new Backburner__default(['batman']);
        var calledWith = [];
        function throttled(first) {
            calledWith.push(first);
        }
        var foo = { isFoo: true };
        var bar = { isBar: true };
        var baz = { isBaz: true };
        bb.throttle(throttled, foo, 10);
        bb.throttle(throttled, bar, 10);
        bb.throttle(throttled, baz, 10);
        assert.deepEqual(calledWith, [{ isFoo: true }], 'throttle method was only called once, with correct argument');
    });
    QUnit.test('throttle without a target, with args - can be canceled', function (assert) {
        var done = assert.async();
        var bb = new Backburner__default(['batman']);
        var calledWith = [];
        function throttled(first) {
            calledWith.push(first);
        }
        var foo = { isFoo: true };
        var bar = { isBar: true };
        var baz = { isBaz: true };
        var qux = { isQux: true };
        bb.throttle(throttled, foo, 10);
        bb.throttle(throttled, bar, 10);
        var timer = bb.throttle(throttled, baz, 10);
        assert.deepEqual(calledWith, [{ isFoo: true }], 'throttle method was only called once, with correct argument');
        setTimeout(function () {
            bb.cancel(timer);
            bb.throttle(throttled, qux, 10, true);
            assert.deepEqual(calledWith, [{ isFoo: true }, { isQux: true }], 'throttle method was called again after canceling prior timer');
        }, 0);
        setTimeout(function () {
            assert.deepEqual(calledWith, [{ isFoo: true }, { isQux: true }], 'throttle method was not called again');
            done();
        }, 20);
    });
    QUnit.test('throttle without a target, with args, not immediate', function (assert) {
        var done = assert.async();
        var bb = new Backburner__default(['batman']);
        var calledWith = [];
        function throttler(first) {
            calledWith.push(first);
        }
        var foo = { isFoo: true };
        var bar = { isBar: true };
        var baz = { isBaz: true };
        bb.throttle(throttler, foo, 10, false);
        bb.throttle(throttler, bar, 10, false);
        bb.throttle(throttler, baz, 10, false);
        assert.deepEqual(calledWith, [], 'throttler was not called immediately');
        setTimeout(function () {
            assert.deepEqual(calledWith, [{ isBaz: true }], 'debounce method was only called once, with correct argument');
            done();
        }, 20);
    });
    QUnit.test('throttle without a target, with args, not immediate - can be canceled', function (assert) {
        var done = assert.async();
        var bb = new Backburner__default(['batman']);
        var calledCount = 0;
        var calledWith = [];
        function throttled(first) {
            calledCount++;
            calledWith.push(first);
        }
        var foo = { isFoo: true };
        var bar = { isBar: true };
        var baz = { isBaz: true };
        bb.throttle(throttled, foo, 10, false);
        bb.throttle(throttled, bar, 10, false);
        var timer = bb.throttle(throttled, baz, 10, false);
        assert.equal(calledCount, 0, 'throttle method was not called immediately');
        setTimeout(function () {
            assert.deepEqual(calledWith, [], 'throttle method has not been called on next tick');
            bb.cancel(timer);
        }, 0);
        setTimeout(function () {
            assert.deepEqual(calledWith, [], 'throttle method is not called when canceled');
            done();
        }, 20);
    });
    QUnit.test('onError', function (assert) {
        assert.expect(1);
        function onError(error) {
            assert.equal('test error', error.message);
        }
        var bb = new Backburner__default(['errors'], {
            onError: onError
        });
        bb.throttle(null, function () {
            throw new Error('test error');
        }, 20);
    });
    QUnit.test('throttle + immediate joins existing run loop instances', function (assert) {
        assert.expect(1);
        function onError(error) {
            assert.equal('test error', error.message);
        }
        var bb = new Backburner__default(['errors'], {
            onError: onError
        });
        bb.run(function () {
            var parentInstance = bb.currentInstance;
            bb.throttle(null, function () {
                assert.equal(bb.currentInstance, parentInstance);
            }, 20, true);
        });
    });
    QUnit.test('when [callback, string] args passed', function (assert) {
        assert.expect(2);
        var bb = new Backburner__default(['one']);
        var functionWasCalled = false;
        bb.run(function () {
            bb.throttle(function (name) {
                assert.equal(name, 'batman');
                functionWasCalled = true;
            }, 'batman', 200);
        });
        assert.ok(functionWasCalled, 'function was called');
    });

});
//# sourceMappingURL=tests.js.map