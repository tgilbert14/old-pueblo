(() => {
  'use strict';

  const soundButton = document.querySelector('#sound');
  const soundLabel = document.querySelector('#sound-label');
  const soundStatus = document.querySelector('#sound-status');
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  const saveData = Boolean(navigator.connection?.saveData);

  if (!soundButton || !soundLabel || !soundStatus || !AudioContextClass || saveData || document.documentElement.classList.contains('static-story')) return;

  const STORY_DURATION = 52.367;
  const SOUNDTRACK_URL = 'assets/audio/story-soundtrack.mp3';
  const OUTPUT_LEVEL = .92;

  let desired = true;
  let loading = false;
  let unavailable = false;
  let needsGestureResume = false;
  let phase = 'idle';
  let storyTime = 0;
  let context;
  let masterGain;
  let soundtrackBuffer;
  let loadPromise;
  let loadController;
  let loadGeneration = 0;
  let activeSource;
  let sourceSerial = 0;
  let stopTimer = 0;
  let suspendTimer = 0;

  const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));

  function setButtonState(state, announcement = '') {
    document.body.dataset.sound = state;
    soundButton.dataset.state = state;
    soundButton.toggleAttribute('aria-busy', state === 'loading');

    if (state === 'on') {
      soundButton.setAttribute('aria-pressed', 'true');
      soundButton.setAttribute('aria-label', 'Mute soundtrack');
      soundLabel.textContent = 'Sound on';
    } else if (state === 'ready') {
      soundButton.setAttribute('aria-pressed', 'true');
      soundButton.setAttribute('aria-label', 'Turn soundtrack off');
      soundLabel.textContent = 'Sound on';
    } else if (state === 'resume') {
      soundButton.setAttribute('aria-pressed', 'true');
      soundButton.setAttribute('aria-label', 'Resume soundtrack');
      soundLabel.textContent = 'Resume sound';
    } else if (state === 'loading') {
      soundButton.setAttribute('aria-pressed', 'true');
      soundButton.setAttribute('aria-label', 'Loading soundtrack');
      soundLabel.textContent = 'Loading sound';
    } else if (state === 'unavailable') {
      soundButton.setAttribute('aria-pressed', 'false');
      soundButton.setAttribute('aria-label', 'Sound unavailable');
      soundButton.disabled = true;
      soundLabel.textContent = 'Sound unavailable';
    } else {
      soundButton.setAttribute('aria-pressed', 'false');
      soundButton.setAttribute('aria-label', 'Turn soundtrack on');
      soundLabel.textContent = 'Sound off';
    }

    if (announcement) soundStatus.textContent = announcement;
  }

  function createGraph() {
    context = new AudioContextClass({ latencyHint: 'playback' });
    masterGain = context.createGain();
    masterGain.gain.value = 0;
    masterGain.connect(context.destination);

    const createdContext = context;
    document.body.dataset.soundContext = createdContext.state;
    createdContext.addEventListener('statechange', () => {
      document.body.dataset.soundContext = createdContext.state;
      if (!desired || unavailable || document.hidden) return;

      if (createdContext.state !== 'running' && phase === 'playing' && soundtrackBuffer) {
        stopSourceImmediate();
        needsGestureResume = true;
        setButtonState('resume', 'Tap Resume sound to continue listening.');
      }
    });
  }

  function unlockAudio() {
    const buffer = context.createBuffer(1, 1, context.sampleRate);
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(masterGain);
    source.start();
  }

  function fadeMaster(value, seconds = .14) {
    if (!context || !masterGain) return;
    const now = context.currentTime;
    const gain = masterGain.gain;
    if (typeof gain.cancelAndHoldAtTime === 'function') gain.cancelAndHoldAtTime(now);
    else {
      gain.cancelScheduledValues(now);
      gain.setValueAtTime(gain.value, now);
    }
    if (seconds <= 0) gain.setValueAtTime(value, now);
    else gain.linearRampToValueAtTime(value, now + seconds);
  }

  function stopSourceImmediate() {
    clearTimeout(stopTimer);
    sourceSerial += 1;
    const source = activeSource;
    activeSource = undefined;
    if (!source) return;
    source.onended = null;
    try { source.stop(); } catch { /* already ended */ }
    source.disconnect();
  }

  function scheduleSuspend(delay = 220) {
    clearTimeout(suspendTimer);
    suspendTimer = setTimeout(() => {
      if (phase !== 'playing' && phase !== 'tail') context?.suspend().catch(() => {});
    }, delay);
  }

  function fadeAndStop(seconds = .14, suspend = true) {
    clearTimeout(stopTimer);
    fadeMaster(0, seconds);
    if (!activeSource) {
      if (suspend) scheduleSuspend(Math.max(80, seconds * 1000 + 40));
      return;
    }

    const serial = sourceSerial;
    stopTimer = setTimeout(() => {
      if (serial === sourceSerial) stopSourceImmediate();
      if (suspend) scheduleSuspend(80);
    }, seconds * 1000 + 30);
  }

  function loadSoundtrack(generation) {
    if (soundtrackBuffer) return Promise.resolve(soundtrackBuffer);
    if (loadPromise) return loadPromise;

    const controller = new AbortController();
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, 10000);
    loadController = controller;
    const request = fetch(SOUNDTRACK_URL, { cache: 'force-cache', signal: controller.signal })
      .then(response => {
        if (!response.ok) throw new Error('Could not load soundtrack');
        return response.arrayBuffer();
      })
      .then(data => context.decodeAudioData(data))
      .then(buffer => {
        if (generation !== loadGeneration || controller.signal.aborted) throw new DOMException('Sound load cancelled', 'AbortError');
        soundtrackBuffer = buffer;
        return buffer;
      })
      .catch(error => {
        if (timedOut) throw new DOMException('Sound load timed out', 'TimeoutError');
        throw error;
      })
      .finally(() => {
        clearTimeout(timeout);
        if (loadController === controller) loadController = undefined;
        if (loadPromise === request && !soundtrackBuffer) loadPromise = undefined;
      });
    loadPromise = request;
    return loadPromise;
  }

  async function resumeWithDeadline() {
    const attempt = context.resume().catch(() => {});
    await Promise.race([attempt, new Promise(resolve => setTimeout(resolve, 1800))]);
    return context.state === 'running';
  }

  function handleSoundFailure(error) {
    console.warn('The optional soundtrack could not start.', error);
    loading = false;
    unavailable = true;
    desired = false;
    needsGestureResume = false;
    stopSourceImmediate();
    soundtrackBuffer = undefined;
    loadPromise = undefined;
    context?.close().catch(() => {});
    setButtonState('unavailable', 'Sound is unavailable. The visual story still works without it.');
    return false;
  }

  function ensureReadyFromGesture() {
    if (!desired || unavailable) return Promise.resolve(false);
    try {
      if (!context) createGraph();

      const generation = loadGeneration;
      clearTimeout(suspendTimer);
      const resumePromise = resumeWithDeadline();
      unlockAudio();
      loading = !soundtrackBuffer;
      setButtonState(loading ? 'loading' : 'ready');

      return Promise.all([loadSoundtrack(generation), resumePromise])
        .then(() => {
          loading = false;
          if (!desired || unavailable || generation !== loadGeneration) return false;
          if (context.state !== 'running') {
            needsGestureResume = true;
            if (phase === 'playing' || phase === 'preparing') {
              setButtonState('resume', 'Sound is ready. Tap Resume sound to begin listening.');
            } else {
              setButtonState('ready');
            }
            return false;
          }

          needsGestureResume = false;
          if (phase === 'playing' && !activeSource) startSource(storyTime);
          else setButtonState('ready');
          return true;
        })
        .catch(error => {
          if (error?.name === 'TimeoutError' && generation === loadGeneration && desired) {
            loading = false;
            needsGestureResume = phase === 'playing';
            context?.suspend().catch(() => {});
            setButtonState(needsGestureResume ? 'resume' : 'ready', needsGestureResume ? 'Sound took too long to load. Tap Resume sound to retry.' : 'Sound took too long to load. It will retry next time.');
            return false;
          }
          if (error?.name === 'AbortError' || generation !== loadGeneration || !desired) return false;
          return handleSoundFailure(error);
        });
    } catch (error) {
      return Promise.resolve(handleSoundFailure(error));
    }
  }

  function startSource(time) {
    if (!desired || !soundtrackBuffer || !context || context.state !== 'running') return false;
    clearTimeout(stopTimer);
    clearTimeout(suspendTimer);
    stopSourceImmediate();

    const source = context.createBufferSource();
    const serial = ++sourceSerial;
    const offset = clamp(time, 0, Math.max(0, soundtrackBuffer.duration - .05));
    source.buffer = soundtrackBuffer;
    source.connect(masterGain);
    activeSource = source;
    fadeMaster(0, 0);
    source.start(0, offset);
    fadeMaster(OUTPUT_LEVEL, .16);
    setButtonState('on', 'Soundtrack playing.');

    source.onended = () => {
      if (serial !== sourceSerial || activeSource !== source) return;
      activeSource = undefined;
      source.disconnect();
      fadeMaster(0, 0);
      if (phase === 'tail' || phase === 'playing') phase = 'idle';
      if (desired) setButtonState('ready');
      scheduleSuspend(100);
    };
    return true;
  }

  function preparePlayback(time) {
    storyTime = clamp(Number(time) || 0, 0, STORY_DURATION);
    phase = 'preparing';
    fadeAndStop(.08, false);
    if (!desired) return Promise.resolve(false);
    return ensureReadyFromGesture();
  }

  function beginPlayback(time) {
    storyTime = clamp(Number(time) || 0, 0, STORY_DURATION);
    phase = 'playing';
    if (!desired || unavailable) return;
    if (soundtrackBuffer && context?.state === 'running') startSource(storyTime);
    else if (needsGestureResume) setButtonState('resume');
    else if (loading) setButtonState('loading');
  }

  function endPlayback({ natural = false, time = storyTime } = {}) {
    storyTime = clamp(Number(time) || 0, 0, STORY_DURATION);
    if (natural && activeSource && desired) {
      phase = 'tail';
      return;
    }

    phase = 'idle';
    fadeAndStop(.14, true);
    if (desired && !unavailable) setButtonState('ready');
  }

  function holdPlayback(time) {
    if (phase !== 'playing') return;
    storyTime = clamp(Number(time) || 0, 0, STORY_DURATION);
    phase = 'held';
    fadeAndStop(.08, false);
    if (desired && !unavailable) setButtonState('ready');
  }

  function resumePlayback(time) {
    if (phase !== 'held') return;
    storyTime = clamp(Number(time) || 0, 0, STORY_DURATION);
    phase = 'playing';
    if (!desired || unavailable) return;
    if (soundtrackBuffer && context?.state === 'running') startSource(storyTime);
    else {
      needsGestureResume = true;
      setButtonState('resume');
    }
  }

  function interruptPlayback() {
    if (phase === 'idle') return;
    phase = 'idle';
    fadeAndStop(.1, true);
    if (desired && !unavailable && !loading) setButtonState('ready');
  }

  function onStoryTime(event) {
    const detail = event.detail || {};
    const nextTime = clamp(Number(detail.time) || 0, 0, STORY_DURATION);
    storyTime = nextTime;
    document.body.dataset.soundScene = nextTime < 12.05 ? 'dawn' : nextTime < 26.18 ? 'monsoon' : nextTime < 40.32 ? 'kitt' : 'stadium';

    if (detail.mode === 'play') return;
    if (phase === 'tail') return;
    if (phase === 'playing' || phase === 'held') interruptPlayback();
  }

  function turnSoundOff() {
    desired = false;
    loading = false;
    needsGestureResume = false;
    loadGeneration += 1;
    loadController?.abort();
    loadController = undefined;
    if (!soundtrackBuffer) loadPromise = undefined;
    if (phase === 'tail') phase = 'idle';
    fadeAndStop(.12, true);
    setButtonState('off', 'Sound off.');
  }

  function turnSoundOn() {
    desired = true;
    if (phase === 'playing') {
      ensureReadyFromGesture();
    } else {
      setButtonState('ready', 'Sound on. Press Play to listen.');
    }
  }

  soundButton.hidden = false;
  setButtonState('ready');
  soundButton.addEventListener('click', () => {
    if (needsGestureResume && desired && phase === 'playing') {
      ensureReadyFromGesture();
    } else if (desired) {
      turnSoundOff();
    } else {
      turnSoundOn();
    }
  });

  document.addEventListener('longsaturday:time', onStoryTime);
  document.addEventListener('longsaturday:reset', () => {
    storyTime = 0;
    interruptPlayback();
  });
  document.addEventListener('longsaturday:interrupt', interruptPlayback);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) return;
    phase = 'idle';
    stopSourceImmediate();
    fadeMaster(0, 0);
    context?.suspend().catch(() => {});
    if (desired && !unavailable && !loading) setButtonState('ready');
  });

  window.longSaturdaySoundscape = Object.freeze({
    beginPlayback,
    endPlayback,
    holdPlayback,
    preparePlayback,
    resumePlayback,
  });
})();
