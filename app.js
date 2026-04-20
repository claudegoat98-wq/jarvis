/* ═══════════════════════════════════════════════
   J.A.R.V.I.S. — Core AI Engine
   Voice Assistant Brain & Logic
   ═══════════════════════════════════════════════ */

class JARVIS {
    constructor() {
        // ── State ──
        this.isListening = false;
        this.isSpeaking = false;
        this.queryCount = 0;
        this.startTime = Date.now();
        this.notes = JSON.parse(localStorage.getItem('jarvis_notes') || '[]');
        this.reminders = JSON.parse(localStorage.getItem('jarvis_reminders') || '[]');
        this.conversationHistory = JSON.parse(localStorage.getItem('jarvis_history') || '[]');
        this.timers = {};
        this.wakeWord = localStorage.getItem('jarvis_wakeword') || 'jarvis';
        this.continuousMode = localStorage.getItem('jarvis_continuous') === 'true';

        // ── Ollama Config ──
        this.ollamaUrl = localStorage.getItem('jarvis_ollama_url') || 'http://localhost:11434';
        this.ollamaModel = localStorage.getItem('jarvis_ollama_model') || 'llama3.2:1b';
        this.ollamaConnected = false;
        this.aiChatHistory = []; // rolling conversation context for Ollama

        // ── Speech APIs ──
        this.SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        this.synth = window.speechSynthesis;
        this.recognition = null;
        this.selectedVoice = null;
        this.speechRate = parseFloat(localStorage.getItem('jarvis_rate') || '1');
        this.speechPitch = parseFloat(localStorage.getItem('jarvis_pitch') || '1');

        // ── DOM Elements ──
        this.elements = {};
        this.cacheDOMElements();

        // ── Initialize ──
        this.init();
    }

    cacheDOMElements() {
        const ids = [
            'statusIndicator', 'currentTime', 'currentDate',
            'speechEngineBar', 'speechEngineStatus',
            'voiceSynthBar', 'voiceSynthStatus',
            'nlpCoreBar', 'nlpCoreStatus',
            'memoryBar', 'memoryStatus',
            'arcReactor', 'coreStatus', 'waveformContainer', 'waveformCanvas',
            'voiceBtn', 'micIcon', 'textInput', 'sendBtn',
            'transcriptDisplay', 'transcriptText',
            'conversationLog', 'tasksContainer',
            'uptime', 'queryCount', 'engineType',
            'settingsBtn', 'settingsModal', 'modalClose',
            'voiceSelect', 'speechRate', 'speechPitch',
            'rateValue', 'pitchValue', 'wakeWord',
            'continuousListening', 'ollamaUrl', 'ollamaModel',
            'clearDataBtn', 'reconnectOllamaBtn', 'saveSettingsBtn',
            'particles', 'capabilityList'
        ];
        ids.forEach(id => {
            this.elements[id] = document.getElementById(id);
        });
    }

    async init() {
        this.createParticles();
        this.startClock();
        this.startUptime();
        this.bindEvents();
        await this.bootSequence();
        this.loadConversationHistory();
        this.checkReminders();
        setInterval(() => this.checkReminders(), 60000);
    }

    // ═══════════════════════════════════════
    // BOOT SEQUENCE
    // ═══════════════════════════════════════
    async bootSequence() {
        const steps = [
            { bar: 'speechEngineBar', status: 'speechEngineStatus', label: 'SPEECH ENGINE', delay: 400 },
            { bar: 'voiceSynthBar', status: 'voiceSynthStatus', label: 'VOICE SYNTH', delay: 600 },
            { bar: 'nlpCoreBar', status: 'nlpCoreStatus', label: 'NLP CORE', delay: 500 },
        ];

        for (const step of steps) {
            await this.animateBar(step);
        }

        // Initialize speech recognition
        if (this.SpeechRecognition) {
            this.initSpeechRecognition();
            this.elements.speechEngineBar.style.width = '100%';
            this.elements.speechEngineStatus.textContent = 'ACTIVE';
        } else {
            this.elements.speechEngineBar.style.width = '0%';
            this.elements.speechEngineStatus.textContent = 'N/A';
            this.addSystemMessage('⚠ Speech recognition not supported. Use text input.');
        }

        // Initialize speech synthesis
        if (this.synth) {
            this.loadVoices();
            this.elements.voiceSynthBar.style.width = '100%';
            this.elements.voiceSynthStatus.textContent = 'ACTIVE';
        }

        // Check Ollama connection
        await this.checkOllamaConnection();

        // Greeting
        const hour = new Date().getHours();
        let greeting;
        if (hour < 12) greeting = 'Good morning';
        else if (hour < 17) greeting = 'Good afternoon';
        else greeting = 'Good evening';

        this.elements.coreStatus.textContent = 'ONLINE';
        this.addJarvisMessage(`${greeting}, sir. All systems are operational. How may I assist you today?`);
        this.speak(`${greeting}, sir. All systems are operational. How may I assist you?`);

        if (this.continuousMode) {
            setTimeout(() => this.startListening(), 3000);
        }
    }

    animateBar(step) {
        return new Promise(resolve => {
            this.elements[step.status].textContent = 'LOADING';
            let progress = 0;
            const interval = setInterval(() => {
                progress += Math.random() * 15 + 5;
                if (progress >= 100) {
                    progress = 100;
                    clearInterval(interval);
                    this.elements[step.bar].style.width = '100%';
                    this.elements[step.status].textContent = 'READY';
                    resolve();
                } else {
                    this.elements[step.bar].style.width = progress + '%';
                }
            }, step.delay / 5);
        });
    }

    // ═══════════════════════════════════════
    // SPEECH RECOGNITION
    // ═══════════════════════════════════════
    initSpeechRecognition() {
        this.recognition = new this.SpeechRecognition();
        this.recognition.continuous = true;
        this.recognition.interimResults = true;
        this.recognition.lang = 'en-US';

        this.recognition.onstart = () => {
            this.isListening = true;
            this.elements.voiceBtn.classList.add('active');
            this.elements.arcReactor.classList.add('listening');
            this.elements.coreStatus.textContent = 'LISTENING';
            this.elements.transcriptDisplay.classList.add('active');
            this.updateStatus('LISTENING', true);
        };

        this.recognition.onresult = (event) => {
            let interimTranscript = '';
            let finalTranscript = '';

            for (let i = event.resultIndex; i < event.results.length; i++) {
                const transcript = event.results[i][0].transcript;
                if (event.results[i].isFinal) {
                    finalTranscript += transcript;
                } else {
                    interimTranscript += transcript;
                }
            }

            this.elements.transcriptText.textContent = interimTranscript || finalTranscript;

            if (finalTranscript) {
                this.processCommand(finalTranscript.trim());
            }
        };

        this.recognition.onerror = (event) => {
            if (event.error !== 'no-speech' && event.error !== 'aborted') {
                console.error('Speech recognition error:', event.error);
                this.addSystemMessage(`Speech error: ${event.error}`);
            }
            this.stopListening();
        };

        this.recognition.onend = () => {
            if (this.isListening && this.continuousMode) {
                try { this.recognition.start(); } catch (e) {}
            } else {
                this.stopListening();
            }
        };
    }

    startListening() {
        if (!this.recognition) {
            this.addSystemMessage('Speech recognition not available. Please use text input.');
            return;
        }
        try {
            this.recognition.start();
        } catch (e) {
            // Already started
        }
    }

    stopListening() {
        this.isListening = false;
        this.elements.voiceBtn.classList.remove('active');
        this.elements.arcReactor.classList.remove('listening');
        this.elements.coreStatus.textContent = 'READY';
        this.elements.transcriptDisplay.classList.remove('active');
        this.elements.transcriptText.textContent = '';
        this.updateStatus('ONLINE', true);
        try { this.recognition?.stop(); } catch (e) {}
    }

    // ═══════════════════════════════════════
    // SPEECH SYNTHESIS
    // ═══════════════════════════════════════
    loadVoices() {
        const populateVoices = () => {
            const voices = this.synth.getVoices();
            this.elements.voiceSelect.innerHTML = '';

            // Prefer male English voices for JARVIS feel
            const preferred = ['Google UK English Male', 'Microsoft David', 'Daniel', 'Alex'];
            let selectedIndex = 0;

            voices.forEach((voice, i) => {
                const option = document.createElement('option');
                option.value = i;
                option.textContent = `${voice.name} (${voice.lang})`;
                this.elements.voiceSelect.appendChild(option);

                if (preferred.some(p => voice.name.includes(p))) {
                    selectedIndex = i;
                }
            });

            const savedVoice = localStorage.getItem('jarvis_voice');
            if (savedVoice !== null && voices[savedVoice]) {
                this.elements.voiceSelect.value = savedVoice;
                this.selectedVoice = voices[savedVoice];
            } else {
                this.elements.voiceSelect.value = selectedIndex;
                this.selectedVoice = voices[selectedIndex];
            }
        };

        populateVoices();
        if (this.synth.onvoiceschanged !== undefined) {
            this.synth.onvoiceschanged = populateVoices;
        }
    }

    speak(text) {
        if (!this.synth) return;
        this.synth.cancel();

        const utterance = new SpeechSynthesisUtterance(text);
        const voices = this.synth.getVoices();
        const voiceIndex = this.elements.voiceSelect?.value;

        if (voices[voiceIndex]) {
            utterance.voice = voices[voiceIndex];
        }

        utterance.rate = this.speechRate;
        utterance.pitch = this.speechPitch;

        utterance.onstart = () => {
            this.isSpeaking = true;
            this.elements.arcReactor.classList.add('speaking');
            this.elements.coreStatus.textContent = 'SPEAKING';
        };

        utterance.onend = () => {
            this.isSpeaking = false;
            this.elements.arcReactor.classList.remove('speaking');
            this.elements.coreStatus.textContent = 'READY';

            if (this.continuousMode && !this.isListening) {
                setTimeout(() => this.startListening(), 500);
            }
        };

        this.synth.speak(utterance);
    }

    // ═══════════════════════════════════════
    // COMMAND PROCESSING (THE BRAIN)
    // ═══════════════════════════════════════
    async processCommand(input) {
        const text = input.toLowerCase().trim();
        this.queryCount++;
        this.elements.queryCount.textContent = this.queryCount;

        // Add user message
        this.addUserMessage(input);

        // Set thinking state
        this.elements.arcReactor.classList.add('thinking');
        this.elements.coreStatus.textContent = 'PROCESSING';

        let response;

        try {
            // ── Greeting ──
            if (/^(hi|hello|hey|good\s*(morning|afternoon|evening|night)|howdy|greetings|what's up|sup)/i.test(text)) {
                response = this.handleGreeting(text);
            }
            // ── Identity ──
            else if (/who\s*are\s*you|what\s*are\s*you|your\s*name|what\s*is\s*your\s*name|introduce\s*yourself/i.test(text)) {
                response = "I am J.A.R.V.I.S. — Just A Rather Very Intelligent System. I'm your personal AI assistant, modeled after the system designed by Tony Stark. I can help with information, calculations, reminders, and much more.";
            }
            // ── Time & Date ──
            else if (/what\s*(time|is\s*the\s*time)|current\s*time|tell\s*me\s*the\s*time/i.test(text)) {
                response = this.handleTime();
            }
            else if (/what\s*(date|day|is\s*the\s*date|is\s*today)|today's\s*date|current\s*date/i.test(text)) {
                response = this.handleDate();
            }
            // ── Weather ──
            else if (/weather|temperature|forecast|is\s*it\s*(hot|cold|raining|sunny|cloudy)/i.test(text)) {
                response = await this.handleWeather(text);
            }
            // ── Calculator ──
            else if (/(?:calculate|compute|what\s*is|how\s*much\s*is|solve|evaluate)\s*([\d\s+\-*/().^%]+)/i.test(text) ||
                       /^[\d\s+\-*/().^%]+$/.test(text)) {
                response = this.handleCalculation(text);
            }
            // ── Unit Conversion ──
            else if (/convert\s+/i.test(text)) {
                response = this.handleConversion(text);
            }
            // ── Open Website / App / Play / Watch ──
            else if (/(?:can\s*you\s*|could\s*you\s*|please\s*|i\s*want\s*(?:to\s*)?)?(?:open|go\s*to|navigate\s*to|visit|launch|start|take\s*me\s*to|bring\s*up)\s+/i.test(text) ||
                     /(?:can\s*you\s*|could\s*you\s*|please\s*|i\s*want\s*(?:to\s*)?)?(?:play|watch)\s+/i.test(text)) {
                response = this.handleOpenWebsite(text);
            }
            // ── Web Search ──
            else if (/(?:search|google|look\s*up|find)\s+(?:for\s+)?(.+)/i.test(text)) {
                response = await this.handleSearch(text);
            }
            // ── Wikipedia ──
            else if (/(?:who\s*(?:is|was)|what\s*(?:is|was|are)|tell\s*me\s*about|explain|define|meaning\s*of)\s+(.+)/i.test(text)) {
                response = await this.handleKnowledge(text);
            }
            // ── Joke ──
            else if (/(?:tell\s*(?:me\s*)?a?\s*joke|make\s*me\s*laugh|something\s*funny|joke)/i.test(text)) {
                response = this.handleJoke();
            }
            // ── Quote ──
            else if (/(?:quote|inspirat|motivat|wisdom)/i.test(text)) {
                response = this.handleQuote();
            }
            // ── Note Taking ──
            else if (/(?:(?:take|make|create|add|save)\s*(?:a\s*)?note|note\s*(?:down|this))\s*[:\s]*(.+)?/i.test(text)) {
                response = this.handleNote(text);
            }
            else if (/(?:show|list|read|display|get)\s*(?:my\s*)?notes/i.test(text)) {
                response = this.handleShowNotes();
            }
            else if (/(?:delete|remove|clear)\s*(?:all\s*)?notes/i.test(text)) {
                this.notes = [];
                localStorage.setItem('jarvis_notes', '[]');
                response = "All notes have been cleared, sir.";
            }
            // ── Reminders ──
            else if (/(?:remind\s*me|set\s*(?:a\s*)?reminder)\s*(?:to|about|that)?\s*(.+?)(?:\s+in\s+(\d+)\s*(minute|minutes|hour|hours|second|seconds))?$/i.test(text)) {
                response = this.handleReminder(text);
            }
            else if (/(?:show|list|display|get)\s*(?:my\s*)?reminders/i.test(text)) {
                response = this.handleShowReminders();
            }
            // ── Timer ──
            else if (/(?:set\s*(?:a\s*)?timer|timer)\s*(?:for\s*)?(\d+)\s*(second|seconds|minute|minutes|hour|hours)/i.test(text)) {
                response = this.handleTimer(text);
            }
            // ── Stopwatch ──
            else if (/(?:start|begin)\s*(?:a\s*)?stopwatch/i.test(text)) {
                response = this.handleStopwatch('start');
            }
            else if (/(?:stop|end|pause)\s*(?:the\s*)?stopwatch/i.test(text)) {
                response = this.handleStopwatch('stop');
            }
            // ── Flip Coin / Roll Dice ──
            else if (/(?:flip|toss)\s*(?:a\s*)?coin/i.test(text)) {
                response = Math.random() < 0.5 ? "The coin landed on Heads." : "The coin landed on Tails.";
            }
            else if (/(?:roll|throw)\s*(?:a\s*)?(?:dice|die|d(\d+))/i.test(text)) {
                response = this.handleDiceRoll(text);
            }
            // ── Random Number ──
            else if (/(?:random\s*number|pick\s*a\s*number)(?:\s*between\s*(\d+)\s*(?:and|to)\s*(\d+))?/i.test(text)) {
                response = this.handleRandomNumber(text);
            }
            // ── Password Generator ──
            else if (/(?:generate|create|make)\s*(?:a\s*)?password/i.test(text)) {
                response = this.handlePasswordGenerator(text);
            }
            // ── Translate ──
            else if (/(?:translate|say\s*in)\s+(.+)/i.test(text)) {
                response = this.handleTranslate(text);
            }
            // ── News ──
            else if (/(?:news|headlines|what's\s*happening|current\s*events)/i.test(text)) {
                response = await this.handleNews();
            }
            // ── Color ──
            else if (/(?:random\s*color|generate\s*(?:a\s*)?color)/i.test(text)) {
                response = this.handleRandomColor();
            }
            // ── System Commands ──
            else if (/(?:system\s*status|diagnostics|health\s*check)/i.test(text)) {
                response = this.handleSystemStatus();
            }
            else if (/(?:clear\s*(?:the\s*)?(?:conversation|chat|history|log))/i.test(text)) {
                this.elements.conversationLog.innerHTML = '';
                this.conversationHistory = [];
                localStorage.setItem('jarvis_history', '[]');
                response = "Conversation log cleared, sir.";
            }
            // ── Help ──
            else if (/(?:help|what\s*can\s*you\s*do|commands|capabilities|features)/i.test(text)) {
                response = this.handleHelp();
            }
            // ── Thank you ──
            else if (/(?:thank|thanks|thank\s*you)/i.test(text)) {
                const responses = [
                    "You're welcome, sir. Always at your service.",
                    "My pleasure, sir. Is there anything else?",
                    "Happy to assist. What else can I do for you?",
                    "Of course, sir. That's what I'm here for."
                ];
                response = responses[Math.floor(Math.random() * responses.length)];
            }
            // ── Goodbye ──
            else if (/(?:goodbye|bye|see\s*you|good\s*night|shut\s*down|exit|quit|sleep)/i.test(text)) {
                response = "Goodbye, sir. I'll be here whenever you need me. All systems entering standby mode.";
            }
            // ── Easter eggs ──
            else if (/(?:i\s*am\s*iron\s*man|tony\s*stark)/i.test(text)) {
                response = "Indeed you are, sir. The suit is at 100% power. Shall I prepare for flight?";
            }
            else if (/(?:avengers\s*assemble)/i.test(text)) {
                response = "Sending priority alert to all Avengers. Captain Rogers, Dr. Banner, Agent Romanoff, and Thor have been notified. ETA: classified.";
            }
            // ── AI Fallback (Ollama) ──
            else if (this.ollamaConnected) {
                response = await this.handleAIQuery(text);
            }
            else {
                response = this.handleUnknown(text);
            }
        } catch (err) {
            console.error('Command processing error:', err);
            response = "I encountered an error processing that request. Please try again.";
        }

        this.elements.arcReactor.classList.remove('thinking');
        this.elements.coreStatus.textContent = 'READY';

        // Respond (skip if already streamed by AI handler)
        if (response === '__STREAMED__') {
            // Already displayed via streaming — speak a short version
            const lastMsg = this.conversationHistory[this.conversationHistory.length - 1];
            if (lastMsg?.text) {
                // Speak only first 2 sentences for speed
                const shortText = lastMsg.text.split(/[.!?]\s+/).slice(0, 2).join('. ') + '.';
                this.speak(shortText);
            }
        } else {
            this.addJarvisMessage(response);
            this.speak(response);
        }
    }

    // ═══════════════════════════════════════
    // COMMAND HANDLERS
    // ═══════════════════════════════════════

    handleGreeting(text) {
        const hour = new Date().getHours();
        let timeGreeting;
        if (hour < 12) timeGreeting = 'Good morning';
        else if (hour < 17) timeGreeting = 'Good afternoon';
        else timeGreeting = 'Good evening';

        const responses = [
            `${timeGreeting}, sir. How may I assist you today?`,
            `${timeGreeting}! All systems are nominal. What can I do for you?`,
            `${timeGreeting}, sir. I'm at your service. What would you like me to do?`,
            `Hello there! I'm ready and waiting. What's on the agenda?`
        ];
        return responses[Math.floor(Math.random() * responses.length)];
    }

    handleTime() {
        const now = new Date();
        const timeStr = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true });
        return `The current time is ${timeStr}.`;
    }

    handleDate() {
        const now = new Date();
        const dateStr = now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
        return `Today is ${dateStr}.`;
    }

    async handleWeather(text) {
        // Extract city if mentioned
        const cityMatch = text.match(/(?:weather|temperature|forecast)\s+(?:in|for|at)\s+(.+)/i);
        const city = cityMatch ? cityMatch[1].trim() : null;

        try {
            if (city) {
                const res = await fetch(`https://wttr.in/${encodeURIComponent(city)}?format=j1`);
                if (!res.ok) throw new Error('Weather API error');
                const data = await res.json();
                const current = data.current_condition[0];
                const tempC = current.temp_C;
                const tempF = current.temp_F;
                const desc = current.weatherDesc[0].value;
                const humidity = current.humidity;
                const wind = current.windspeedKmph;
                return `Weather in ${city}: ${desc}, ${tempC}°C (${tempF}°F). Humidity: ${humidity}%, Wind: ${wind} km/h.`;
            } else {
                const res = await fetch('https://wttr.in/?format=j1');
                if (!res.ok) throw new Error('Weather API error');
                const data = await res.json();
                const current = data.current_condition[0];
                const area = data.nearest_area[0].areaName[0].value;
                const tempC = current.temp_C;
                const tempF = current.temp_F;
                const desc = current.weatherDesc[0].value;
                return `Weather in ${area}: ${desc}, ${tempC}°C (${tempF}°F). Humidity: ${current.humidity}%.`;
            }
        } catch (e) {
            return "I'm unable to fetch weather data at the moment. Please try again or specify a city: 'weather in London'.";
        }
    }

    handleCalculation(text) {
        try {
            let expr = text.replace(/(?:calculate|compute|what\s*is|how\s*much\s*is|solve|evaluate)\s*/i, '').trim();
            // Handle power notation
            expr = expr.replace(/\^/g, '**');
            // Handle percentage
            expr = expr.replace(/(\d+)\s*%\s*of\s*(\d+)/g, '($1/100)*$2');
            // Basic sanitization
            expr = expr.replace(/[^0-9+\-*/().%\s]/g, '');
            if (!expr) return "Please provide a mathematical expression to calculate.";
            const result = Function('"use strict"; return (' + expr + ')')();
            if (isNaN(result) || !isFinite(result)) return "That calculation resulted in an undefined value.";
            return `The result is ${result}.`;
        } catch (e) {
            return "I couldn't parse that mathematical expression. Please try again with a clear expression, like 'calculate 25 times 4'.";
        }
    }

    handleConversion(text) {
        const match = text.match(/convert\s+(\d+(?:\.\d+)?)\s*(\w+)\s*(?:to|in)\s*(\w+)/i);
        if (!match) return "Please specify a conversion like: 'convert 100 celsius to fahrenheit' or 'convert 5 miles to kilometers'.";

        const value = parseFloat(match[1]);
        const from = match[2].toLowerCase();
        const to = match[3].toLowerCase();

        const conversions = {
            'celsius_fahrenheit': v => (v * 9/5) + 32,
            'fahrenheit_celsius': v => (v - 32) * 5/9,
            'miles_kilometers': v => v * 1.60934,
            'kilometers_miles': v => v / 1.60934,
            'km_miles': v => v / 1.60934,
            'miles_km': v => v * 1.60934,
            'pounds_kilograms': v => v * 0.453592,
            'kilograms_pounds': v => v / 0.453592,
            'kg_pounds': v => v / 0.453592,
            'pounds_kg': v => v * 0.453592,
            'feet_meters': v => v * 0.3048,
            'meters_feet': v => v / 0.3048,
            'inches_centimeters': v => v * 2.54,
            'centimeters_inches': v => v / 2.54,
            'cm_inches': v => v / 2.54,
            'inches_cm': v => v * 2.54,
            'gallons_liters': v => v * 3.78541,
            'liters_gallons': v => v / 3.78541,
            'ounces_grams': v => v * 28.3495,
            'grams_ounces': v => v / 28.3495,
        };

        const key = `${from}_${to}`;
        if (conversions[key]) {
            const result = conversions[key](value).toFixed(4);
            return `${value} ${from} = ${result} ${to}.`;
        }
        return `I don't support converting ${from} to ${to} yet. Try common units like celsius/fahrenheit, miles/kilometers, pounds/kilograms.`;
    }

    async handleSearch(text) {
        const match = text.match(/(?:search|google|look\s*up|find)\s+(?:for\s+)?(.+)/i);
        if (!match) return "What would you like me to search for?";
        const query = match[1].trim();

        // Use Ollama AI if connected
        if (this.ollamaConnected) {
            return await this.handleAIQuery(`The user wants to know about: ${query}. Provide a helpful, comprehensive answer based on your knowledge.`);
        }

        // Fallback: open Google
        window.open(`https://www.google.com/search?q=${encodeURIComponent(query)}`, '_blank');
        return `Searching for "${query}" on Google. Start Ollama for instant AI answers.`;
    }

    handleOpenWebsite(text) {
        // Well-known sites/apps by name
        const wellKnownSites = {
            'youtube': 'https://www.youtube.com',
            'google': 'https://www.google.com',
            'gmail': 'https://mail.google.com',
            'email': 'https://mail.google.com',
            'mail': 'https://mail.google.com',
            'twitter': 'https://twitter.com',
            'x': 'https://twitter.com',
            'facebook': 'https://www.facebook.com',
            'instagram': 'https://www.instagram.com',
            'insta': 'https://www.instagram.com',
            'reddit': 'https://www.reddit.com',
            'tiktok': 'https://www.tiktok.com',
            'linkedin': 'https://www.linkedin.com',
            'whatsapp': 'https://web.whatsapp.com',
            'whatsapp web': 'https://web.whatsapp.com',
            'netflix': 'https://www.netflix.com',
            'spotify': 'https://open.spotify.com',
            'amazon': 'https://www.amazon.com',
            'github': 'https://github.com',
            'stackoverflow': 'https://stackoverflow.com',
            'stack overflow': 'https://stackoverflow.com',
            'discord': 'https://discord.com/app',
            'twitch': 'https://www.twitch.tv',
            'pinterest': 'https://www.pinterest.com',
            'wikipedia': 'https://www.wikipedia.org',
            'chatgpt': 'https://chat.openai.com',
            'maps': 'https://maps.google.com',
            'google maps': 'https://maps.google.com',
            'drive': 'https://drive.google.com',
            'google drive': 'https://drive.google.com',
            'docs': 'https://docs.google.com',
            'google docs': 'https://docs.google.com',
            'translate': 'https://translate.google.com',
            'google translate': 'https://translate.google.com',
            'calendar': 'https://calendar.google.com',
            'news': 'https://news.google.com',
            'google news': 'https://news.google.com',
            'snapchat': 'https://www.snapchat.com',
            'telegram': 'https://web.telegram.org',
            'notion': 'https://www.notion.so',
            'figma': 'https://www.figma.com',
            'canva': 'https://www.canva.com',
            'ebay': 'https://www.ebay.com',
            'walmart': 'https://www.walmart.com',
            'disney plus': 'https://www.disneyplus.com',
            'disney+': 'https://www.disneyplus.com',
            'hulu': 'https://www.hulu.com',
            'prime video': 'https://www.primevideo.com',
            'amazon prime': 'https://www.primevideo.com',
        };

        // Check for "play X on YouTube" or "search X on YouTube"
        const ytPlayMatch = text.match(/(?:play|watch|search|find|show|put\s*on)\s+(.+?)\s+(?:on|in|from)\s+youtube/i);
        if (ytPlayMatch) {
            const query = ytPlayMatch[1].trim();
            window.open(`https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`, '_blank');
            return `Searching YouTube for "${query}". Enjoy!`;
        }

        // Check for "play X" (defaults to YouTube) or "watch X"
        const playMatch = text.match(/(?:play|watch)\s+(.+)/i);
        if (playMatch) {
            const query = playMatch[1].trim();
            // Check if they just want to open a known site
            const normalized = query.toLowerCase().replace(/[^a-z0-9\s+]/g, '').trim();
            if (wellKnownSites[normalized]) {
                window.open(wellKnownSites[normalized], '_blank');
                return `Opening ${normalized.charAt(0).toUpperCase() + normalized.slice(1)} for you, sir.`;
            }
            // Otherwise search on YouTube
            window.open(`https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`, '_blank');
            return `Searching YouTube for "${query}". Enjoy watching!`;
        }

        // Check for "open [site name]" by well-known name
        const openMatch = text.match(/(?:open|go\s*to|navigate\s*to|visit|launch|start|show\s*me|take\s*me\s*to|bring\s*up)\s+(.+)/i);
        if (openMatch) {
            const siteName = openMatch[1].trim().toLowerCase().replace(/[^a-z0-9\s+]/g, '').trim();

            // Check well-known sites
            if (wellKnownSites[siteName]) {
                window.open(wellKnownSites[siteName], '_blank');
                const displayName = siteName.charAt(0).toUpperCase() + siteName.slice(1);
                return `Opening ${displayName} for you, sir.`;
            }

            // Check if it looks like a URL
            const urlish = openMatch[1].trim();
            if (/[a-z0-9][-a-z0-9]*\.[a-z]{2,}/i.test(urlish)) {
                let url = urlish;
                if (!url.startsWith('http')) url = 'https://' + url;
                window.open(url, '_blank');
                return `Opening ${url} in a new tab.`;
            }

            // Try adding .com
            const guessUrl = `https://www.${siteName.replace(/\s+/g, '')}.com`;
            window.open(guessUrl, '_blank');
            return `I don't recognize "${siteName}" specifically, but I'll try opening ${guessUrl} for you.`;
        }

        return "Please specify what you'd like me to open.";
    }

    async handleKnowledge(text) {
        const match = text.match(/(?:who\s*(?:is|was)|what\s*(?:is|was|are)|tell\s*me\s*about|explain|define|meaning\s*of)\s+(.+)/i);
        if (!match) return "What would you like to know about?";
        const topic = match[1].trim();

        // Use Ollama AI for knowledge
        if (this.ollamaConnected) {
            return await this.handleAIQuery(text);
        }

        // Fallback: Open Google
        window.open(`https://www.google.com/search?q=${encodeURIComponent(topic)}`, '_blank');
        return `I've opened a search for "${topic}". Start Ollama for instant AI answers.`;
    }

    handleJoke() {
        const jokes = [
            "Why do programmers prefer dark mode? Because light attracts bugs.",
            "I told my wife I was going to make a car powered by spaghetti. She said I was being impasta.",
            "Why don't scientists trust atoms? Because they make up literally everything.",
            "What do you call a fish without eyes? A fsh.",
            "Why did the scarecrow win an award? He was outstanding in his field.",
            "Parallel lines have so much in common. It's a shame they'll never meet.",
            "Why did the developer go broke? Because he used up all his cache.",
            "What's the best thing about Switzerland? I don't know, but the flag is a big plus.",
            "Why do Java developers wear glasses? Because they can't C#.",
            "I would tell you a UDP joke, but you might not get it.",
            "There are only 10 types of people in the world: those who understand binary and those who don't.",
            "A SQL query walks into a bar, walks up to two tables, and asks: 'Can I join you?'",
            "Why do programmers always confuse Halloween and Christmas? Because OCT 31 equals DEC 25.",
            "What's a pirate's favorite programming language? R, you'd think, but they really love the C.",
            "How do you comfort a JavaScript bug? You console it."
        ];
        return jokes[Math.floor(Math.random() * jokes.length)];
    }

    handleQuote() {
        const quotes = [
            '"The only way to do great work is to love what you do." — Steve Jobs',
            '"Innovation distinguishes between a leader and a follower." — Steve Jobs',
            '"The best time to plant a tree was 20 years ago. The second best time is now." — Chinese Proverb',
            '"In the middle of difficulty lies opportunity." — Albert Einstein',
            '"The future belongs to those who believe in the beauty of their dreams." — Eleanor Roosevelt',
            '"Sometimes you have to run before you can walk." — Tony Stark',
            '"I am Iron Man." — Tony Stark',
            '"It is not the strongest of the species that survives, but the most adaptable." — Charles Darwin',
            '"The only limit to our realization of tomorrow will be our doubts of today." — Franklin D. Roosevelt',
            '"Stay hungry, stay foolish." — Steve Jobs',
            '"Success is not final, failure is not fatal: it is the courage to continue that counts." — Winston Churchill',
            '"Be the change that you wish to see in the world." — Mahatma Gandhi',
            '"Technology is best when it brings people together." — Matt Mullenweg',
            '"The only impossible journey is the one you never begin." — Tony Robbins'
        ];
        return quotes[Math.floor(Math.random() * quotes.length)];
    }

    handleNote(text) {
        const match = text.match(/(?:(?:take|make|create|add|save)\s*(?:a\s*)?note|note\s*(?:down|this))\s*[:\s]*(.+)/i);
        if (match && match[1]) {
            const note = {
                text: match[1].trim(),
                timestamp: new Date().toISOString(),
                id: Date.now()
            };
            this.notes.push(note);
            localStorage.setItem('jarvis_notes', JSON.stringify(this.notes));
            this.addTask(`Note saved: "${note.text.substring(0, 30)}..."`, 'completed');
            return `Note saved: "${note.text}". You now have ${this.notes.length} note${this.notes.length > 1 ? 's' : ''}.`;
        }
        return "What would you like me to note down? Say 'take a note' followed by your note.";
    }

    handleShowNotes() {
        if (this.notes.length === 0) {
            return "You don't have any saved notes. Say 'take a note' followed by what you'd like to remember.";
        }
        let response = `You have ${this.notes.length} note${this.notes.length > 1 ? 's' : ''}:\n`;
        this.notes.forEach((note, i) => {
            const date = new Date(note.timestamp).toLocaleDateString();
            response += `${i + 1}. ${note.text} (${date})\n`;
        });
        return response;
    }

    handleReminder(text) {
        const match = text.match(/(?:remind\s*me|set\s*(?:a\s*)?reminder)\s*(?:to|about|that)?\s*(.+?)(?:\s+in\s+(\d+)\s*(minute|minutes|hour|hours|second|seconds))?$/i);
        if (!match || !match[1]) return "What should I remind you about? Try: 'remind me to check email in 5 minutes'.";

        const reminderText = match[1].trim();
        const amount = match[2] ? parseInt(match[2]) : 5;
        const unit = match[3] || 'minutes';

        let ms;
        if (unit.startsWith('second')) ms = amount * 1000;
        else if (unit.startsWith('minute')) ms = amount * 60000;
        else if (unit.startsWith('hour')) ms = amount * 3600000;
        else ms = amount * 60000;

        const reminder = {
            text: reminderText,
            triggerTime: Date.now() + ms,
            id: Date.now()
        };

        this.reminders.push(reminder);
        localStorage.setItem('jarvis_reminders', JSON.stringify(this.reminders));

        this.addTask(`Reminder: ${reminderText} (in ${amount} ${unit})`, 'active');

        setTimeout(() => {
            this.addJarvisMessage(`⏰ REMINDER: ${reminderText}`);
            this.speak(`Reminder, sir: ${reminderText}`);
            this.reminders = this.reminders.filter(r => r.id !== reminder.id);
            localStorage.setItem('jarvis_reminders', JSON.stringify(this.reminders));
        }, ms);

        return `Reminder set: "${reminderText}" in ${amount} ${unit}.`;
    }

    handleShowReminders() {
        const active = this.reminders.filter(r => r.triggerTime > Date.now());
        if (active.length === 0) return "No active reminders. Set one with: 'remind me to...'";

        let response = `You have ${active.length} active reminder${active.length > 1 ? 's' : ''}:\n`;
        active.forEach((r, i) => {
            const remaining = Math.round((r.triggerTime - Date.now()) / 60000);
            response += `${i + 1}. ${r.text} (in ~${remaining} minutes)\n`;
        });
        return response;
    }

    checkReminders() {
        const now = Date.now();
        const due = this.reminders.filter(r => r.triggerTime <= now);
        due.forEach(r => {
            this.addJarvisMessage(`⏰ REMINDER: ${r.text}`);
            this.speak(`Reminder, sir: ${r.text}`);
        });
        if (due.length > 0) {
            this.reminders = this.reminders.filter(r => r.triggerTime > now);
            localStorage.setItem('jarvis_reminders', JSON.stringify(this.reminders));
        }
    }

    handleTimer(text) {
        const match = text.match(/(?:set\s*(?:a\s*)?timer|timer)\s*(?:for\s*)?(\d+)\s*(second|seconds|minute|minutes|hour|hours)/i);
        if (!match) return "How long should the timer be? Try: 'set a timer for 5 minutes'.";

        const amount = parseInt(match[1]);
        const unit = match[2];

        let ms;
        if (unit.startsWith('second')) ms = amount * 1000;
        else if (unit.startsWith('minute')) ms = amount * 60000;
        else ms = amount * 3600000;

        const timerId = 'timer_' + Date.now();
        this.addTask(`Timer: ${amount} ${unit}`, 'active');

        this.timers[timerId] = setTimeout(() => {
            this.addJarvisMessage(`⏰ Timer complete! ${amount} ${unit} have elapsed.`);
            this.speak(`Timer complete! ${amount} ${unit} have elapsed, sir.`);
            delete this.timers[timerId];
        }, ms);

        return `Timer set for ${amount} ${unit}. I'll alert you when it's done.`;
    }

    handleStopwatch(action) {
        if (action === 'start') {
            this.stopwatchStart = Date.now();
            this.addTask('Stopwatch running', 'active');
            return "Stopwatch started. Say 'stop stopwatch' when you're ready.";
        } else {
            if (!this.stopwatchStart) return "No stopwatch is currently running. Say 'start stopwatch' first.";
            const elapsed = Date.now() - this.stopwatchStart;
            const seconds = Math.floor(elapsed / 1000);
            const minutes = Math.floor(seconds / 60);
            const remainingSeconds = seconds % 60;
            this.stopwatchStart = null;
            return `Stopwatch stopped. Elapsed time: ${minutes} minutes and ${remainingSeconds} seconds.`;
        }
    }

    handleDiceRoll(text) {
        const match = text.match(/d(\d+)/i);
        const sides = match ? parseInt(match[1]) : 6;
        const result = Math.floor(Math.random() * sides) + 1;
        return `Rolling a ${sides}-sided die... You got a ${result}!`;
    }

    handleRandomNumber(text) {
        const match = text.match(/(?:between|from)\s*(\d+)\s*(?:and|to)\s*(\d+)/i);
        const min = match ? parseInt(match[1]) : 1;
        const max = match ? parseInt(match[2]) : 100;
        const result = Math.floor(Math.random() * (max - min + 1)) + min;
        return `Random number between ${min} and ${max}: ${result}.`;
    }

    handlePasswordGenerator(text) {
        const match = text.match(/(\d+)\s*characters?/i);
        const length = match ? parseInt(match[1]) : 16;
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_+-=';
        let password = '';
        for (let i = 0; i < length; i++) {
            password += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        // Don't speak the password
        this.addJarvisMessage(`Generated a ${length}-character password: \`${password}\``);
        return `I've generated a ${length}-character secure password and displayed it in the log. I won't read it aloud for security.`;
    }

    handleTranslate(text) {
        // Open Google Translate
        const match = text.match(/(?:translate|say\s*in\s*\w+)\s+(.+)/i);
        if (match) {
            const phrase = match[1].trim();
            window.open(`https://translate.google.com/?sl=auto&tl=es&text=${encodeURIComponent(phrase)}`, '_blank');
            return `I've opened Google Translate with "${phrase}". You can change the target language there.`;
        }
        return "What would you like me to translate?";
    }

    async handleNews() {
        window.open('https://news.google.com', '_blank');
        return "I've opened Google News for you in a new tab with the latest headlines.";
    }

    handleRandomColor() {
        const hex = '#' + Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0');
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return `Random color generated: ${hex} (RGB: ${r}, ${g}, ${b}). That's a lovely shade!`;
    }

    handleSystemStatus() {
        const uptime = this.formatUptime(Date.now() - this.startTime);
        const memMB = performance?.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : 'N/A';
        return `System Status Report:\n• Uptime: ${uptime}\n• Queries processed: ${this.queryCount}\n• Notes stored: ${this.notes.length}\n• Active reminders: ${this.reminders.filter(r => r.triggerTime > Date.now()).length}\n• Memory: ${memMB} MB\n• Speech engine: ${this.SpeechRecognition ? 'Active' : 'Unavailable'}\n• Voice synthesis: ${this.synth ? 'Active' : 'Unavailable'}\n• AI backend: ${this.ollamaConnected ? 'Ollama (' + this.ollamaModel + ')' : 'Offline'}\n• Ollama URL: ${this.ollamaUrl}`;
    }

    handleHelp() {
        return `Here are some things I can do:\n\n🕐 "What time is it?" — Current time\n📅 "What's the date?" — Current date\n🌤 "Weather in London" — Weather info\n🧮 "Calculate 25 * 4" — Math\n📏 "Convert 100 celsius to fahrenheit" — Unit conversion\n🔍 "Search for AI news" — AI-powered answers\n🌐 "Open youtube.com" — Open websites\n📖 "Who is Elon Musk?" — Knowledge\n😄 "Tell me a joke" — Jokes\n💬 "Give me a quote" — Inspirational quotes\n📝 "Take a note: buy groceries" — Save notes\n📋 "Show my notes" — List notes\n⏰ "Remind me to call mom in 5 minutes" — Set reminders\n⏳ "Set a timer for 10 minutes" — Timer\n⏱ "Start stopwatch" — Stopwatch\n🎲 "Roll a dice" — Random dice\n🪙 "Flip a coin" — Coin toss\n🔢 "Random number between 1 and 100" — Random\n🔑 "Generate a password" — Password creator\n🌐 "Translate hello to Spanish" — Translation\n📰 "Show me the news" — Headlines\n🎨 "Random color" — Color generator\n📊 "System status" — Diagnostics\n🗑 "Clear conversation" — Reset chat\n\n🤖 AI Backend: Ollama (${this.ollamaConnected ? '✅ Connected — ' + this.ollamaModel : '❌ Not running'})\nAsk me anything and I\'ll use my AI brain to answer!`;
    }

    handleUnknown(text) {
        return `I don't have a built-in answer for that, sir. Make sure Ollama is running locally (run 'ollama serve' in your terminal) so I can use AI to answer any question. Say 'help' to see my built-in capabilities.`;
    }

    // ═══════════════════════════════════════
    // AI INTEGRATION (Ollama — Local & Free)
    // ═══════════════════════════════════════

    // Check if Ollama is running
    async checkOllamaConnection() {
        try {
            const response = await fetch(`${this.ollamaUrl}/api/tags`, { signal: AbortSignal.timeout(3000) });
            if (response.ok) {
                const data = await response.json();
                this.ollamaConnected = true;
                this.elements.nlpCoreBar.style.width = '100%';
                this.elements.nlpCoreStatus.textContent = 'OLLAMA';
                this.elements.engineType.textContent = `OLLAMA (${this.ollamaModel.toUpperCase()})`;

                // Check if selected model exists
                const models = data.models?.map(m => m.name) || [];
                const hasModel = models.some(m => m.startsWith(this.ollamaModel));
                if (!hasModel && models.length > 0) {
                    // Use first available model
                    this.ollamaModel = models[0].split(':')[0];
                    localStorage.setItem('jarvis_ollama_model', this.ollamaModel);
                    this.elements.engineType.textContent = `OLLAMA (${this.ollamaModel.toUpperCase()})`;
                }

                this.addSystemMessage(`Ollama AI connected: ${this.ollamaModel}. Full intelligence online.`);
                return true;
            }
        } catch (err) {
            // Ollama not running
        }
        this.ollamaConnected = false;
        this.elements.nlpCoreBar.style.width = '20%';
        this.elements.nlpCoreStatus.textContent = 'OFFLINE';
        this.elements.engineType.textContent = 'BASIC MODE';
        this.addSystemMessage('⚠ Ollama not detected. Run "ollama serve" for AI capabilities. Built-in commands still work.');
        return false;
    }

    // Query Ollama local AI — STREAMING for instant responses
    async handleAIQuery(text) {
        if (!this.ollamaConnected) {
            return this.handleUnknown(text);
        }

        try {
            this.addTask('Processing AI query...', 'active');

            // Build messages with conversation context (keep minimal for speed)
            const messages = [
                {
                    role: 'system',
                    content: 'You are J.A.R.V.I.S., Tony Stark\'s AI. Be concise (1-3 sentences). Witty, refined, direct.'
                },
                ...this.aiChatHistory.slice(-4),
                { role: 'user', content: text }
            ];

            const response = await fetch(`${this.ollamaUrl}/api/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: this.ollamaModel,
                    messages: messages,
                    stream: true,
                    options: {
                        temperature: 0.7,
                        num_predict: 150,
                        num_ctx: 2048
                    }
                })
            });

            if (!response.ok) {
                throw new Error(`Ollama error: ${response.status}`);
            }

            // Create the message bubble immediately for streaming
            const time = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
            const msg = document.createElement('div');
            msg.className = 'message jarvis';
            const twId = `tw_${Date.now()}`;
            msg.innerHTML = `
                <span class="message-sender">J.A.R.V.I.S.</span>
                <span class="message-time">${time}</span>
                <span class="typewriter" id="${twId}"></span>
            `;
            this.elements.conversationLog.appendChild(msg);

            // Stream the response token by token
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let fullText = '';
            const twSpan = document.getElementById(twId);

            // Update reactor to speaking state early
            this.elements.arcReactor.classList.remove('thinking');
            this.elements.arcReactor.classList.add('speaking');
            this.elements.coreStatus.textContent = 'SPEAKING';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value, { stream: true });
                // Ollama sends one JSON object per line
                const lines = chunk.split('\n').filter(l => l.trim());
                for (const line of lines) {
                    try {
                        const json = JSON.parse(line);
                        if (json.message?.content) {
                            fullText += json.message.content;
                            if (twSpan) {
                                twSpan.textContent = fullText;
                            }
                            this.elements.conversationLog.scrollTop = this.elements.conversationLog.scrollHeight;
                        }
                    } catch (e) {
                        // Skip malformed JSON chunks
                    }
                }
            }

            // Mark typewriter done
            if (twSpan) twSpan.classList.add('done');

            // Reset reactor state
            this.elements.arcReactor.classList.remove('speaking');
            this.elements.coreStatus.textContent = 'READY';

            // Store in chat history
            const trimmed = fullText.trim();
            if (trimmed) {
                this.aiChatHistory.push({ role: 'user', content: text });
                this.aiChatHistory.push({ role: 'assistant', content: trimmed });
                if (this.aiChatHistory.length > 20) {
                    this.aiChatHistory = this.aiChatHistory.slice(-12);
                }
                this.conversationHistory.push({ role: 'jarvis', text: trimmed, time: Date.now() });
                this.saveHistory();
            }

            // Return special flag so processCommand knows we already handled the message
            return '__STREAMED__';
        } catch (err) {
            console.error('Ollama error:', err);
            this.ollamaConnected = false;
            await this.checkOllamaConnection();
            return `I lost connection to Ollama. Make sure it's running with "ollama serve". Error: ${err.message}`;
        }
    }

    // ═══════════════════════════════════════
    // UI HELPERS
    // ═══════════════════════════════════════
    addUserMessage(text) {
        const time = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
        const msg = document.createElement('div');
        msg.className = 'message user';
        msg.innerHTML = `
            <span class="message-sender">USER</span>
            <span class="message-time">${time}</span>
            ${this.escapeHTML(text)}
        `;
        this.elements.conversationLog.appendChild(msg);
        this.elements.conversationLog.scrollTop = this.elements.conversationLog.scrollHeight;

        this.conversationHistory.push({ role: 'user', text, time: Date.now() });
        this.saveHistory();
    }

    addJarvisMessage(text) {
        const time = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
        const msg = document.createElement('div');
        msg.className = 'message jarvis';
        msg.innerHTML = `
            <span class="message-sender">J.A.R.V.I.S.</span>
            <span class="message-time">${time}</span>
            <span class="typewriter" id="tw_${Date.now()}">${this.escapeHTML(text)}</span>
        `;
        this.elements.conversationLog.appendChild(msg);
        this.elements.conversationLog.scrollTop = this.elements.conversationLog.scrollHeight;

        // Mark typewriter done after a delay
        const twSpan = msg.querySelector('.typewriter');
        setTimeout(() => twSpan?.classList.add('done'), text.length * 20 + 500);

        this.conversationHistory.push({ role: 'jarvis', text, time: Date.now() });
        this.saveHistory();
    }

    addSystemMessage(text) {
        const msg = document.createElement('div');
        msg.className = 'message system';
        msg.textContent = `[SYSTEM] ${text}`;
        this.elements.conversationLog.appendChild(msg);
        this.elements.conversationLog.scrollTop = this.elements.conversationLog.scrollHeight;
    }

    addTask(text, type = 'system') {
        const task = document.createElement('div');
        task.className = `task-item ${type}-task`;
        task.innerHTML = `<span class="task-status">●</span><span>${this.escapeHTML(text)}</span>`;
        this.elements.tasksContainer.appendChild(task);

        // Auto-remove after 30s
        if (type === 'active' || type === 'completed') {
            setTimeout(() => {
                task.classList.add('completed-task');
                task.classList.remove('active-task');
                setTimeout(() => task.remove(), 10000);
            }, type === 'completed' ? 5000 : 30000);
        }
    }

    updateStatus(text, active) {
        this.elements.statusIndicator.className = `status-indicator ${active ? 'active' : ''}`;
        this.elements.statusIndicator.querySelector('.status-text').textContent = text;
    }

    escapeHTML(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    saveHistory() {
        // Keep only last 50 messages
        if (this.conversationHistory.length > 50) {
            this.conversationHistory = this.conversationHistory.slice(-50);
        }
        localStorage.setItem('jarvis_history', JSON.stringify(this.conversationHistory));
    }

    loadConversationHistory() {
        // Only load last 10 messages from history
        const recent = this.conversationHistory.slice(-10);
        recent.forEach(msg => {
            const time = new Date(msg.time).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
            const div = document.createElement('div');
            div.className = `message ${msg.role}`;
            if (msg.role === 'user') {
                div.innerHTML = `<span class="message-sender">USER</span><span class="message-time">${time}</span>${this.escapeHTML(msg.text)}`;
            } else {
                div.innerHTML = `<span class="message-sender">J.A.R.V.I.S.</span><span class="message-time">${time}</span><span class="typewriter done">${this.escapeHTML(msg.text)}</span>`;
            }
            this.elements.conversationLog.appendChild(div);
        });
        this.elements.conversationLog.scrollTop = this.elements.conversationLog.scrollHeight;
    }

    // ═══════════════════════════════════════
    // CLOCK & UPTIME
    // ═══════════════════════════════════════
    startClock() {
        const update = () => {
            const now = new Date();
            this.elements.currentTime.textContent = now.toLocaleTimeString('en-US', { hour12: false });
            this.elements.currentDate.textContent = now.toLocaleDateString('en-US', {
                weekday: 'short', month: 'short', day: 'numeric', year: 'numeric'
            }).toUpperCase();
        };
        update();
        setInterval(update, 1000);
    }

    startUptime() {
        setInterval(() => {
            const elapsed = Date.now() - this.startTime;
            this.elements.uptime.textContent = this.formatUptime(elapsed);
            // Update memory display
            const usage = Math.min(Math.round(15 + (this.queryCount * 2) + Math.random() * 5), 95);
            this.elements.memoryBar.style.width = usage + '%';
            this.elements.memoryStatus.textContent = usage + '%';
        }, 1000);
    }

    formatUptime(ms) {
        const s = Math.floor(ms / 1000) % 60;
        const m = Math.floor(ms / 60000) % 60;
        const h = Math.floor(ms / 3600000);
        return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    }

    // ═══════════════════════════════════════
    // PARTICLES
    // ═══════════════════════════════════════
    createParticles() {
        const container = this.elements.particles;
        for (let i = 0; i < 30; i++) {
            const particle = document.createElement('div');
            particle.className = 'particle';
            particle.style.left = Math.random() * 100 + '%';
            particle.style.animationDuration = (Math.random() * 15 + 10) + 's';
            particle.style.animationDelay = (Math.random() * 15) + 's';
            particle.style.width = (Math.random() * 3 + 1) + 'px';
            particle.style.height = particle.style.width;
            container.appendChild(particle);
        }
    }

    // ═══════════════════════════════════════
    // EVENT BINDINGS
    // ═══════════════════════════════════════
    bindEvents() {
        // Voice button
        this.elements.voiceBtn.addEventListener('click', () => {
            if (this.isListening) {
                this.stopListening();
            } else {
                this.startListening();
            }
        });

        // Text input
        this.elements.textInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && this.elements.textInput.value.trim()) {
                this.processCommand(this.elements.textInput.value.trim());
                this.elements.textInput.value = '';
            }
        });

        this.elements.sendBtn.addEventListener('click', () => {
            if (this.elements.textInput.value.trim()) {
                this.processCommand(this.elements.textInput.value.trim());
                this.elements.textInput.value = '';
            }
        });

        // Capability items
        this.elements.capabilityList.addEventListener('click', (e) => {
            const item = e.target.closest('.capability-item');
            if (!item) return;
            const cmd = item.getAttribute('data-cmd');
            const commands = {
                time: "What time is it?",
                weather: "What's the weather?",
                calc: "Calculate ",
                search: "Search for ",
                joke: "Tell me a joke",
                note: "Show my notes",
                remind: "Show my reminders",
                translate: "Translate ",
                define: "Define ",
                news: "Show me the news",
                timer: "Set a timer for 5 minutes",
                quote: "Give me a quote"
            };
            const cmdText = commands[cmd];
            if (cmdText.endsWith(' ')) {
                this.elements.textInput.value = cmdText;
                this.elements.textInput.focus();
            } else {
                this.processCommand(cmdText);
            }
        });

        // Settings
        this.elements.settingsBtn.addEventListener('click', () => {
            this.elements.settingsModal.classList.add('active');
            // Load current settings
            this.elements.speechRate.value = this.speechRate;
            this.elements.rateValue.textContent = this.speechRate + 'x';
            this.elements.speechPitch.value = this.speechPitch;
            this.elements.pitchValue.textContent = this.speechPitch;
            this.elements.wakeWord.value = this.wakeWord;
            this.elements.continuousListening.checked = this.continuousMode;
            this.elements.ollamaUrl.value = this.ollamaUrl;
            this.elements.ollamaModel.value = this.ollamaModel;
        });

        this.elements.modalClose.addEventListener('click', () => {
            this.elements.settingsModal.classList.remove('active');
        });

        this.elements.settingsModal.addEventListener('click', (e) => {
            if (e.target === this.elements.settingsModal) {
                this.elements.settingsModal.classList.remove('active');
            }
        });

        this.elements.speechRate.addEventListener('input', (e) => {
            this.elements.rateValue.textContent = e.target.value + 'x';
        });

        this.elements.speechPitch.addEventListener('input', (e) => {
            this.elements.pitchValue.textContent = e.target.value;
        });

        this.elements.saveSettingsBtn.addEventListener('click', async () => {
            this.speechRate = parseFloat(this.elements.speechRate.value);
            this.speechPitch = parseFloat(this.elements.speechPitch.value);
            this.wakeWord = this.elements.wakeWord.value.toLowerCase().trim() || 'jarvis';
            this.continuousMode = this.elements.continuousListening.checked;
            this.ollamaUrl = this.elements.ollamaUrl.value.trim() || 'http://localhost:11434';
            this.ollamaModel = this.elements.ollamaModel.value.trim() || 'llama3';

            const voiceIndex = this.elements.voiceSelect.value;
            const voices = this.synth.getVoices();
            this.selectedVoice = voices[voiceIndex];

            // Save to localStorage
            localStorage.setItem('jarvis_rate', this.speechRate);
            localStorage.setItem('jarvis_pitch', this.speechPitch);
            localStorage.setItem('jarvis_wakeword', this.wakeWord);
            localStorage.setItem('jarvis_continuous', this.continuousMode);
            localStorage.setItem('jarvis_ollama_url', this.ollamaUrl);
            localStorage.setItem('jarvis_ollama_model', this.ollamaModel);
            localStorage.setItem('jarvis_voice', voiceIndex);

            this.elements.settingsModal.classList.remove('active');
            this.addSystemMessage('Configuration saved. Reconnecting to Ollama...');
            this.speak('Configuration updated, sir. Reconnecting to Ollama.');

            // Try to connect to Ollama with new settings
            await this.checkOllamaConnection();
        });

        this.elements.clearDataBtn.addEventListener('click', () => {
            if (confirm('This will clear all notes, reminders, and conversation history. Continue?')) {
                localStorage.removeItem('jarvis_notes');
                localStorage.removeItem('jarvis_reminders');
                localStorage.removeItem('jarvis_history');
                this.notes = [];
                this.reminders = [];
                this.conversationHistory = [];
                this.elements.conversationLog.innerHTML = '';
                this.addSystemMessage('All data cleared.');
            }
        });

        // Reconnect Ollama button
        this.elements.reconnectOllamaBtn.addEventListener('click', async () => {
            this.ollamaUrl = this.elements.ollamaUrl.value.trim() || 'http://localhost:11434';
            this.ollamaModel = this.elements.ollamaModel.value.trim() || 'llama3';
            localStorage.setItem('jarvis_ollama_url', this.ollamaUrl);
            localStorage.setItem('jarvis_ollama_model', this.ollamaModel);
            this.addSystemMessage('Reconnecting to Ollama...');
            const connected = await this.checkOllamaConnection();
            if (connected) {
                this.speak('Ollama reconnected successfully, sir.');
            } else {
                this.speak('Unable to reach Ollama. Please make sure it is running.');
            }
        });

        // Keyboard shortcut: Space bar to toggle listening when not focused on input
        document.addEventListener('keydown', (e) => {
            if (e.code === 'Space' && document.activeElement !== this.elements.textInput &&
                document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
                e.preventDefault();
                if (this.isListening) {
                    this.stopListening();
                } else {
                    this.startListening();
                }
            }
            // Escape to stop
            if (e.code === 'Escape') {
                if (this.isListening) this.stopListening();
                if (this.isSpeaking) this.synth.cancel();
            }
        });
    }
}

// ═══════════════════════════════════════
// INITIALIZATION
// ═══════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
    window.jarvis = new JARVIS();
});
