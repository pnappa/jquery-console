// JSConsole 0.69
//
// Copyright 2019 Patrick Nappa, forked from chrisdone's jquery-console
// Copyright 2010 Chris Done, Simon David Pratt. All rights reserved.
//
// Redistribution and use in source and binary forms, with or without
// modification, are permitted provided that the following conditions
// are met:
//
//    1. Redistributions of source code must retain the above
//       copyright notice, this list of conditions and the following
//       disclaimer.
//
//    2. Redistributions in binary form must reproduce the above
//       copyright notice, this list of conditions and the following
//       disclaimer in the documentation and/or other materials
//       provided with the distribution.
//
// THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS
// "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT
// LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS
// FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE
// COPYRIGHT HOLDERS OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT,
// INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING,
// BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
// LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
// CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT
// LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN
// ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE
// POSSIBILITY OF SUCH DAMAGE.
(function() {
    var isWebkit = !!~navigator.userAgent.indexOf(' AppleWebKit/');

    // factor out the css magic strings, uglifyjs will compress these down
    var cssPrefix = 'js-console-';
    var cursorCSSClass = cssPrefix + 'cursor';
    var innerCSSClass = cssPrefix + 'inner';
    var typerCSSClass = cssPrefix + 'typer';
    var welcomeCSSClass = cssPrefix + 'welcome';
    var focusCSSClass = cssPrefix + 'focus';
    var nofocusCSSClass = cssPrefix + 'nofocus';
    var promptCSSClass = cssPrefix + 'prompt';
    var promptBoxCSSClass = cssPrefix + 'prompt-box';
    var promptLabelCSSClass = cssPrefix + 'prompt-label';
    var messageCSSClass = cssPrefix + 'message';
    var messageValueCSSClass = messageCSSClass + '-value';
    var messageSuccessCSSClass = messageCSSClass + '-success';
    var messageErrorCSSClass = messageCSSClass + '-error';

    // instantiate a console for a div element
    window.makeConsole = function(forEl, config) {
        ////////////////////////////////////////////////////////////////////////
        // Constants
        // Some are enums, data types, others just for optimisation
        var keyCodes = {
            // left
            37: moveBackward,
            // right
            39: moveForward,
            // up
            38: previousHistory,
            // down
            40: nextHistory,
            // backspace
            8: backDelete,
            // delete
            46: forwardDelete,
            // end
            35: moveToEnd,
            // start
            36: moveToStart,
            // return
            13: commandTrigger,
            // tab
            18: doNothing,
            // tab
            9: doComplete
        };
        var ctrlCodes = {
            // C-a
            65: moveToStart,
            // C-e
            69: moveToEnd,
            // C-d
            68: forwardDelete,
            // C-n
            78: nextHistory,
            // C-p
            80: previousHistory,
            // C-b
            66: moveBackward,
            // C-f
            70: moveForward,
            // C-k
            75: deleteUntilEnd,
            // C-l
            76: clearScreen,
            // C-u
            85: clearCurrentPrompt
        };
        if (config.ctrlCodes) {
            Object.assign(ctrlCodes, config.ctrlCodes);
        }
        var altCodes = {
            // M-f
            70: moveToNextWord,
            // M-b
            66: moveToPreviousWord,
            // M-d
            68: deleteNextWord
        };
        var shiftCodes = {
            // return
            13: newLine,
        };
        var cursor = '<span class="' + cursorCSSClass + '">&nbsp;</span>';

        ////////////////////////////////////////////////////////////////////////
        // Globals
        //var container = element;
        var container = forEl;
        var inner = document.createElement('div');
        inner.className = innerCSSClass;

        // erjiang: changed this from a text input to a textarea so we
        // can get pasted newlines
        var typer = document.createElement('textarea');
        typer.className = typerCSSClass;
        ["autocomplete", "autocorrect", "autocapitalize", "spellcheck"].forEach(function (el) {
            typer.setAttribute(el, "off");
        });
        typer.className = typerCSSClass;

        // Prompt
        var promptBox;
        var prompt;
        var continuedPromptLabel = config && config.continuedPromptLabel ?
            config.continuedPromptLabel : "> ";
        var column = 0;
        var promptText = '';
        var restoreText = '';
        var continuedText = '';
        var fadeOnReset = config.fadeOnReset !== undefined ? config.fadeOnReset : true;
        var scrollType = config && config.scrollPage ? "pagescroll" : "divscroll";
        // Prompt history stack
        var history = [];
        var ringn = 0;
        // For reasons unknown to The Sword of Michael himself, Opera
        // triggers and sends a key character when you hit various
        // keys like PgUp, End, etc. So there is no way of knowing
        // when a user has typed '#' or End. My solution is in the
        // typer.keydown and typer.keypress functions; I use the
        // variable below to ignore the keypress event if the keydown
        // event succeeds.
        var cancelKeyPress = 0;
        // When this value is false, the prompt will not respond to input
        var acceptInput = true;
        // When this value is true, the command has been canceled
        var cancelCommand = false;

        // External exports object
        var extern = {};

        ////////////////////////////////////////////////////////////////////////
        // Main entry point
        (function() {
            extern.promptLabel = config && config.promptLabel ? config.promptLabel : "> ";
            container.append(inner);
            inner.append(typer);
            typer.classList.add(typerCSSClass);
            if (config.welcomeMessage)
                message(config.welcomeMessage, welcomeCSSClass);
            newPromptBox();
            if (config.autofocus) {
                inner.classList.add(focusCSSClass);
                typer.focus();
                setTimeout(function() {
                    inner.classList.add(focusCSSClass);
                    typer.focus();
                }, 100);
            }
            extern.inner = inner;
            extern.typer = typer;
            extern.scrollToBottom = scrollToBottom;
            extern.report = report;
            extern.showCompletion = showCompletion;
            extern.clearScreen = clearScreen;
            extern.disableInput = disableInput;
            extern.enableInput = enableInput;
        })();


        // jQuery animation helper
        function elementAnimate(el, animationClass, callback, keepcallback) {
            // this is called when the fade finishes
            var endAnimFn = function () {
                if (!keepcallback) {
                    el.removeEventListener('animationend', endAnimFn);
                }

                callback();
            };
            el.addEventListener('animationend', endAnimFn);

            // start the animation
            el.classList.add(animationClass);
        }

        ////////////////////////////////////////////////////////////////////////
        // Reset terminal
        extern.reset = function() {
            var welcome = (typeof config.welcomeMessage != 'undefined');

            var removeElements = function() {
                var dupChildren = Array.from(inner.children);
                for (var i = 0; i < dupChildren.length; ++i) {
                    var el = dupChildren[i];

                    // ..following the previous code only applying to divs?
                    // XXX: currently unaware of why, also should lowercase it?
                    if (el.tagName != 'DIV') continue; 

                    // XXX: this seems hacky, inherited from previous code
                    // what if the welcome isn't the first element?
                    if (!welcome) {
                        el.parentElement.removeChild(el);
                    } else {
                        welcome = false;
                    }
                }
            };

            if (fadeOnReset) {
                // fade out, then fade back in, and inbetween clear the screen
                elementAnimate(inner.parentElement, 'fadeout', function () {
                    removeElements();
                    newPromptBox();
                    inner.parentElement.classList.remove('fadeout');
                    inner.parentElement.classList.add('fadein');
                });

            } else {
                removeElements();
                newPromptBox();
                focusConsole();
            }
        };

        var focusConsole = function() {
            // XXX: why isn't the jquery-console-nofocus removed?
            inner.classList.add(focusCSSClass);
            typer.focus();
        };

        extern.focus = function() {
            focusConsole();
        }

        ////////////////////////////////////////////////////////////////////////
        // provide an alert to the user
        // XXX: this function is currently broken
        extern.notice = function(msg, style) {
            var n = document.createElement('div');
            n.classList.add('notice');
            var subN = document.createElement('div');
            subN.innerText = msg;
            n.appendChild(subN);

            n.classList.add("invisible");
            container.append(n);
            var focused = true;
            if (style == 'fadeout')
                setTimeout(function() {
                    elementAnimate(n, 'fadeout', function () {
                        // deleet urself
                        n.parentElement.removeChild(n);
                    });
                }, 4000);
            else if (style == 'prompt') {
                // XXX: surely there's better ways to do this
                var a = document.createElement('br');
                var adiv = document.createElement('div');
                adiv.classList.add('action');
                var adivanchor = document.createElement('a');
                // TODO: this seems like it might fail CSP,
                // I *can* add a hash for this though, right? but there's probably
                // a better way. make it a button instead of <a>?
                adivanchor.setAttribute('href', "javascript:");
                adivanchor.innerText = 'OK';
                var cleardiv = document.createElement('div');
                cleardiv.classList.add('clear');

                adiv.appendChild(adivanchor);
                adiv.appendChild(cleardiv);

                n.append(a);
                n.append(adiv);

                focused = false;
                a.addEventListener('click', function() {
                    n.parentElement.removeChild(n);
                    inner.classList.remove('halfvisible');
                });
            }

            n.classList.remove('invisible');

            // XXX: this currently doesn't work, am looking into how to do this in css
            elementAnimate(n, 'uncovertop', function () {
                console.log("finished uncovering");
                if (!focused) {
                    inner.classList.add('halfvisible');
                }
                inner.classList.remove('uncovertop');
            });
            n.classList.add('defaultcursor');
            return n;
        };

        ////////////////////////////////////////////////////////////////////////
        // Make a new prompt box
        function newPromptBox() {
            column = 0;
            promptText = '';
            ringn = 0; // Reset the position of the history ring
            enableInput();

            promptBox = document.createElement('div');
            promptBox.classList.add(promptBoxCSSClass);

            var label = document.createElement('span');
            label.classList.add(promptLabelCSSClass);


            var labelText = extern.continuedPrompt ? continuedPromptLabel : extern.promptLabel;
            label.innerText = labelText;
            promptBox.append(label);

            label.innerHTML = label.innerHTML.replace(' ', '&nbsp;');
            prompt = document.createElement('span');
            prompt.classList.add(promptCSSClass);
            promptBox.append(prompt);
            inner.append(promptBox);
            updatePromptDisplay();
        };

        ////////////////////////////////////////////////////////////////////////
        // Handle setting focus
        // if config.globalCapture is set, the entire document is capturable,
        // otherwise, it's just the terminal's containing div
        (function () {
            var clickEl = container;
            if (config.globalCapture) {
                clickEl = document; 
            } 
            clickEl.addEventListener('click', function() {
                // Don't mess with the focus if there is an active selection
                if (window.getSelection().toString()) {
                    return false;
                }

                inner.classList.add(focusCSSClass);
                inner.classList.remove(nofocusCSSClass);
                if (isWebkit) {
                    focusElementWithoutScrolling(typer);
                } else {
                    typer.classList.add('fixposition');
                    typer.focus();
                }
                scrollToBottom();
                return false;
            });
        })();

        ////////////////////////////////////////////////////////////////////////
        // Handle losing focus
        typer.addEventListener('blur', function() {
            inner.classList.remove(focusCSSClass);
            inner.classList.add(nofocusCSSClass);
        });

        ////////////////////////////////////////////////////////////////////////
        // Bind to the paste event of the input box so we know when we
        // get pasted data
        typer.onpaste = function(e) {
            // wipe typer input clean just in case
            typer.value = "";
            // this timeout is required because the onpaste event is
            // fired *before* the text is actually pasted
            setTimeout(function() {
                typer.consoleInsert(typer.value);
                typer.value = '';
            }, 0);
        };

        ////////////////////////////////////////////////////////////////////////
        // Handle key hit before translation
        // For picking up control characters like up/left/down/right
        typer.onkeydown = function(e) {
            cancelKeyPress = 0;
            var keyCode = e.keyCode;
            // C-c: cancel the execution
            if (e.ctrlKey && keyCode == 67) {
                cancelKeyPress = keyCode;
                cancelExecution();
                return false;
            }
            if (acceptInput) {
                if (e.shiftKey && keyCode in shiftCodes) {
                    cancelKeyPress = keyCode;
                    (shiftCodes[keyCode])();
                    return false;
                } else if (e.altKey && keyCode in altCodes) {
                    cancelKeyPress = keyCode;
                    (altCodes[keyCode])();
                    return false;
                } else if (e.ctrlKey && keyCode in ctrlCodes) {
                    cancelKeyPress = keyCode;
                    (ctrlCodes[keyCode])();
                    return false;
                } else if (keyCode in keyCodes) {
                    cancelKeyPress = keyCode;
                    (keyCodes[keyCode])();
                    return false;
                }
            }
        };

        ////////////////////////////////////////////////////////////////////////
        // Handle key press
        typer.onkeypress = function(e) {
            var keyCode = e.keyCode || e.which;
            if (isIgnorableKey(e)) {
                return false;
            }
            // C-v: don't insert on paste event
            if ((e.ctrlKey || e.metaKey) && String.fromCharCode(keyCode).toLowerCase() == 'v') {
                return true;
            }
            if (acceptInput && cancelKeyPress != keyCode && keyCode >= 32) {
                if (cancelKeyPress) return false;
                if (
                    typeof config.charInsertTrigger == 'undefined' || (
                        typeof config.charInsertTrigger == 'function' &&
                        config.charInsertTrigger(keyCode, promptText)
                    )
                ) {
                    typer.consoleInsert(keyCode);
                }
            }
            if (isWebkit) return false;
        };

        function isIgnorableKey(e) {
            // for now just filter alt+tab that we receive on some platforms when
            // user switches windows (goes away from the browser)
            return ((e.keyCode == keyCodes.tab || e.keyCode == 192) && e.altKey);
        };

        ////////////////////////////////////////////////////////////////////////
        // Rotate through the command history
        function rotateHistory(n) {
            if (history.length == 0) return;
            ringn += n;
            if (ringn < 0) ringn = history.length;
            else if (ringn > history.length) ringn = 0;
            var prevText = promptText;
            if (ringn == 0) {
                promptText = restoreText;
            } else {
                promptText = history[ringn - 1];
            }
            if (config.historyPreserveColumn) {
                if (promptText.length < column + 1) {
                    column = promptText.length;
                } else if (column == 0) {
                    column = promptText.length;
                }
            } else {
                column = promptText.length;
            }
            updatePromptDisplay();
        };

        function previousHistory() {
            rotateHistory(-1);
        };

        function nextHistory() {
            rotateHistory(1);
        };

        // Add something to the history ring
        function addToHistory(line) {
            history.push(line);
            restoreText = '';
        };

        // Delete the character at the current position
        function deleteCharAtPos() {
            if (column < promptText.length) {
                promptText =
                    promptText.substring(0, column) +
                    promptText.substring(column + 1);
                restoreText = promptText;
                return true;
            } else return false;
        };

        function backDelete() {
            if (moveColumn(-1)) {
                deleteCharAtPos();
                updatePromptDisplay();
            }
        };

        function forwardDelete() {
            if (deleteCharAtPos()) {
                updatePromptDisplay();
            }
        };

        function deleteUntilEnd() {
            while (deleteCharAtPos()) {
                updatePromptDisplay();
            }
        };

        function clearCurrentPrompt() {
            extern.promptText("");
        };

        // TODO (pnappa): optimise this more, my vanilla-js version explicitly iterates over
        // each children and checks its contains a class
        // a better way is to use queryselectorall, i think..?
        function clearScreen() {

            var to_remove = [];
            for (var i = 0; i < inner.children.length; ++i) {
                if (inner.children[i].classList.contains(promptBoxCSSClass) || inner.children[i].classList.contains(messageCSSClass)) {
                    to_remove.push(inner.children[i]);
                }
            }

            // don't remove the last prompt
            for (var i = 0; i < to_remove.length - 1; ++i) {
                inner.removeChild(to_remove[i]);
            }

            extern.report(' ');
            extern.focus();
        };

        function deleteNextWord() {
            // A word is defined within this context as a series of alphanumeric
            // characters.
            // Delete up to the next alphanumeric character
            while (
                column < promptText.length &&
                !isCharAlphanumeric(promptText[column])
            ) {
                deleteCharAtPos();
                updatePromptDisplay();
            }
            // Then, delete until the next non-alphanumeric character
            while (
                column < promptText.length &&
                isCharAlphanumeric(promptText[column])
            ) {
                deleteCharAtPos();
                updatePromptDisplay();
            }
        };

        function newLine() {
            var lines = promptText.split("\n");
            var last_line = lines.slice(-1)[0];
            var spaces = last_line.match(/^(\s*)/g)[0];
            var new_line = "\n" + spaces;
            promptText += new_line;
            moveColumn(new_line.length);
            updatePromptDisplay();
        };

        ////////////////////////////////////////////////////////////////////////
        // Validate command and trigger it if valid, or show a validation error
        function commandTrigger() {
            var line = promptText;
            if (typeof config.commandValidate == 'function') {
                var ret = config.commandValidate(line);
                if (ret == true || ret == false) {
                    if (ret) {
                        handleCommand();
                    }
                } else {
                    commandResult(ret, messageErrorCSSClass);
                }
            } else {
                handleCommand();
            }
        };

        // Scroll to the bottom of the view
        function scrollToBottom() {
            if (scrollType === "pagescroll") {
                window.scrollTo(0, document.body.scrollHeight);
            } else if (scrollType === "divscroll") {
                inner.setAttribute('scrollTop', inner.getAttribute('scrollHeight'));
            }
        };

        function cancelExecution() {
            if (typeof config.cancelHandle == 'function') {
                config.cancelHandle();
            }
        }

        ////////////////////////////////////////////////////////////////////////
        // Handle a command
        function handleCommand() {
            if (typeof config.commandHandle == 'function') {
                disableInput();
                addToHistory(promptText);
                var text = promptText;
                if (extern.continuedPrompt) {
                    if (continuedText)
                        continuedText += '\n' + promptText;
                    else continuedText = promptText;
                } else continuedText = undefined;
                if (continuedText) text = continuedText;
                var ret = config.commandHandle(text, function(msgs) {
                    commandResult(msgs);
                });
                if (extern.continuedPrompt && !continuedText)
                    continuedText = promptText;
                if (typeof ret == 'boolean') {
                    if (ret) {
                        // Command succeeded without a result.
                        commandResult();
                    } else {
                        commandResult(
                            'Command failed.',
                            messageErrorCSSClass 
                        );
                    }
                } else if (typeof ret == "string") {
                    commandResult(ret, messageSuccessCSSClass);
                } else if (typeof ret == 'object' && ret.length) {
                    commandResult(ret);
                } else if (extern.continuedPrompt) {
                    commandResult();
                }
            }
        };

        ////////////////////////////////////////////////////////////////////////
        // Disable input
        function disableInput() {
            acceptInput = false;
        };

        // Enable input
        function enableInput() {
            acceptInput = true;
        }

        ////////////////////////////////////////////////////////////////////////
        // Reset the prompt in invalid command
        function commandResult(msg, className) {
            column = -1;
            updatePromptDisplay();
            if (typeof msg == 'string') {
                message(msg, className);
            } else if (Array.isArray(msg)) {
                for (var x in msg) {
                    var ret = msg[x];
                    message(ret.msg, ret.className);
                }
            } else if (msg !== undefined) { // Assume it's a DOM node or jQuery object.
                inner.append(msg);
            }
            newPromptBox();
        };

        ////////////////////////////////////////////////////////////////////////
        // Report some message into the console
        function report(msg, className) {
            var text = promptText;
            promptBox.remove();
            commandResult(msg, className);
            extern.promptText(text);
        };

        ////////////////////////////////////////////////////////////////////////
        // Display a message
        function message(msg, className) {
            var mesg = document.createElement('div');
            mesg.classList.add(messageCSSClass);
            if (className) {
                mesg.classList.add(className);
            }
            filledText(mesg, msg);
            // cheeky way to emulate jquery .hide() without inline css
            mesg.classList.add('hide');
            inner.append(mesg);
            mesg.classList.remove('hide');
        };

        ////////////////////////////////////////////////////////////////////////
        // Handle normal character insertion
        // data can either be a number, which will be interpreted as the
        // numeric value of a single character, or a string
        typer.consoleInsert = function(data) {
            // TODO: remove redundant indirection
            var text = (typeof data == 'number') ? String.fromCharCode(data) : data;
            var before = promptText.substring(0, column);
            var after = promptText.substring(column);
            promptText = before + text + after;
            moveColumn(text.length);
            restoreText = promptText;
            updatePromptDisplay();
        };

        ////////////////////////////////////////////////////////////////////////
        // Move to another column relative to this one
        // Negative means go back, positive means go forward.
        function moveColumn(n) {
            if (column + n >= 0 && column + n <= promptText.length) {
                column += n;
                return true;
            } else return false;
        };

        function moveForward() {
            if (moveColumn(1)) {
                updatePromptDisplay();
                return true;
            }
            return false;
        };

        function moveBackward() {
            if (moveColumn(-1)) {
                updatePromptDisplay();
                return true;
            }
            return false;
        };

        function moveToStart() {
            if (moveColumn(-column))
                updatePromptDisplay();
        };

        function moveToEnd() {
            if (moveColumn(promptText.length - column))
                updatePromptDisplay();
        };

        function moveToNextWord() {
            while (
                column < promptText.length &&
                !isCharAlphanumeric(promptText[column]) &&
                moveForward()
            ) {}
            while (
                column < promptText.length &&
                isCharAlphanumeric(promptText[column]) &&
                moveForward()
            ) {}
        };

        function moveToPreviousWord() {
            // Move backward until we find the first alphanumeric
            while (
                column - 1 >= 0 &&
                !isCharAlphanumeric(promptText[column - 1]) &&
                moveBackward()
            ) {}
            // Move until we find the first non-alphanumeric
            while (
                column - 1 >= 0 &&
                isCharAlphanumeric(promptText[column - 1]) &&
                moveBackward()
            ) {}
        };

        function isCharAlphanumeric(charToTest) {
            if (typeof charToTest == 'string') {
                var code = charToTest.charCodeAt();
                return (code >= 'A'.charCodeAt() && code <= 'Z'.charCodeAt()) ||
                    (code >= 'a'.charCodeAt() && code <= 'z'.charCodeAt()) ||
                    (code >= '0'.charCodeAt() && code <= '9'.charCodeAt());
            }
            return false;
        };

        function doComplete() {
            if (typeof config.completeHandle == 'function') {
                doCompleteDirectly();
            } else {
                issueComplete();
            }
        };

        /* return a string containing the completion merged into the promptText */
        function mergeCompletion(promptText, completion) {
            // pnappa: added the autocompleteSmart option
            // doing `wow tx<tab>`, with the result being `txt`, will result in `wow txtxt` without autocompleteSmart
            if (!config.autocompleteSmart) {
                extern.promptText(promptText + completion);
            // with this option, `wow tx<tab>` with a result of `txt` will result in `wow txt`
            } else if (config.autocompleteSmart) {
                var argv = promptText.split(' ');
                // we're autocompleting on the final element, keep the entire suggestion
                if (argv[argv.length - 1] == '') {
                    extern.promptText(promptText + completion);
                } else {
                    extern.promptText(argv.slice(0, argv.length - 1).join(' ') + ' ' + completion);
                }
            }
        }

        function doCompleteDirectly() {
            if (typeof config.completeHandle == 'function') {
                var completions = config.completeHandle(promptText);
                var len = completions.length;
                if (len === 1) {
                    extern.promptText(mergeCompletion(promptText, completions[0]));
                } else if (len > 1 && config.cols) {
                    var prompt = promptText;
                    // Compute the number of rows that will fit in the width
                    var max = 0;
                    for (var i = 0; i < len; i++) {
                        max = Math.max(max, completions[i].length);
                    }
                    max += 2;
                    var n = Math.floor(config.cols / max);
                    var buffer = "";
                    var col = 0;
                    for (i = 0; i < len; i++) {
                        var completion = completions[i];
                        buffer += completions[i];
                        for (var j = completion.length; j < max; j++) {
                            buffer += " ";
                        }
                        if (++col >= n) {
                            buffer += "\n";
                            col = 0;
                        }
                    }
                    commandResult(buffer, messageValueCSSClass);
                    extern.promptText(prompt);
                }
            }
        };

        function issueComplete() {
            if (typeof config.completeIssuer == 'function') {
                config.completeIssuer(promptText);
            }
        };

        function showCompletion(promptText, completions) {
            var len = completions.length;
            if (len === 1) {
                extern.promptText(mergeCompletion(promptText, completions[0]));
            } else if (len > 1 && config.cols) {
                var prompt = promptText;
                // Compute the number of rows that will fit in the width
                var max = 0;
                for (var i = 0; i < len; i++) {
                    max = Math.max(max, completions[i].length);
                }
                max += 2;
                var n = Math.floor(config.cols / max);
                var buffer = "";
                var col = 0;
                for (i = 0; i < len; i++) {
                    var completion = completions[i];
                    buffer += completions[i];
                    for (var j = completion.length; j < max; j++) {
                        buffer += " ";
                    }
                    if (++col >= n) {
                        buffer += "\n";
                        col = 0;
                    }
                }
                commandResult(buffer, messageValueCSSClass);
                extern.promptText(prompt);
            }
        };

        function doNothing() {};

        extern.promptText = function(text) {
            if (typeof text === 'string') {
                promptText = text;
                column = promptText.length;
                updatePromptDisplay();
            }
            return promptText;
        };

        ////////////////////////////////////////////////////////////////////////
        // Update the prompt display
        function updatePromptDisplay() {
            var line = promptText;
            var html = '';
            if (column > 0 && line == '') {
                // When we have an empty line just display a cursor.
                html = cursor;
            } else if (column == promptText.length) {
                // We're at the end of the line, so we need to display
                // the text *and* cursor.
                html = htmlEncode(line) + cursor;
            } else {
                // Grab the current character, if there is one, and
                // make it the current cursor.
                var before = line.substring(0, column);
                var current = line.substring(column, column + 1);
                if (current) {
                    current =
                        '<span class="' + cursorCSSClass + '">' +
                        htmlEncode(current) +
                        '</span>';
                }
                var after = line.substring(column + 1);
                html = htmlEncode(before) + current + htmlEncode(after);
            }
            prompt.innerHTML = html;
            scrollToBottom();
        };

        // TODO: replace this, this isn't *safe*
        // might have to refactor everywhere that uses this, and use TextNodes
        // Simple HTML encoding
        // Simply replace '<', '>' and '&'
        // TODO: Use jQuery's .html() trick, or grab a proper, fast
        // HTML encoder.
        function htmlEncode(text) {
            return (
                text.replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/</g, '&lt;')
                .replace(/ /g, '&nbsp;')
                .replace(/\n/g, '<br />')
            );
        };

        return extern;
    };

    // Simple utility for printing messages
    function filledText(element, txt) {
        // set the text, but now replace tabs and newlines with html equivalents
        element.innerText = txt;
        element.innerHTML = element.innerHTML.replace(/\t/g, '&nbsp;&nbsp;').replace(/\n/g, '<br/>');
    }

    // Alternative method for focus without scrolling
    // XXX: doesn't seem to work on iOS
    // but, really should refactor the way input works to enable it to work on mobile.
    function focusElementWithoutScrolling(element) {
        var x = window.scrollX,
            y = window.scrollY;
        element.focus();
        window.scrollTo(x, y);
    };
})();
