define('backburner-demo', ['backburner'], function (Backburner) { 'use strict';

    Backburner = Backburner && Backburner.hasOwnProperty('default') ? Backburner['default'] : Backburner;

    var bb = new Backburner(['foobar', 'render']);
    bb.DEBUG = true;
    main();
    function main() {
        runLater();
    }
    function runLater() {
        bb.later(function () {
            runThrottle();
        }, 500);
    }
    function runThrottle() {
        bb.throttle(function () {
            runDebounce();
        }, 500, false);
    }
    // Not called immediately
    function runDebounce() {
        bb.debounce(function () {
            runSchedule();
        }, 500, false);
    }
    // Same for defer
    function runSchedule() {
        bb.schedule('render', function () {
            runJoin();
        });
    }
    function runJoin() {
        bb.join(function () {
            run();
        });
    }
    function run() {
        bb.run(function () {
            done();
        });
    }
    function done() {
        console.log("Async stack trace:");
        console.trace();
        console.log("Chain ended. %cSet a breakpoint at the top frame in the stack trace above and refresh.", "font-weight: bold");
        console.log("Blackboxing %cbackburner.js%c script makes the traces even better (⌘+Shift+P > Show Blackboxing > Add %c/backburner\\.js$%c)", "color:blue", "color:black", "color:red", "color:black");
    }

});
