(() => {
  'use strict';

  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';

  const FPS = 30;
  const FRAME_COUNT = 1571;
  const DURATION = 52.367;
  const MOBILE_QUERY = '(max-width: 760px), (hover: none) and (max-width: 1024px)';

  const SEGMENTS = [
    { id: 'desert', t0: 0, t1: 9.767, weight: 2.2, accent: '#d87348', poster: 'desert' },
    { id: 'conn1', t0: 9.767, t1: 14.333, weight: 0.68, from: 'desert', to: 'monsoon' },
    { id: 'monsoon', t0: 14.333, t1: 23.9, weight: 1.85, accent: '#a8bac6', poster: 'monsoon' },
    { id: 'conn2', t0: 23.9, t1: 28.467, weight: 0.66, from: 'monsoon', to: 'kittpeak' },
    { id: 'kittpeak', t0: 28.467, t1: 38.033, weight: 2.05, accent: '#8293c6', poster: 'kittpeak' },
    { id: 'conn3', t0: 38.033, t1: 42.6, weight: 0.72, from: 'kittpeak', to: 'stadium' },
    { id: 'stadium', t0: 42.6, t1: 52.367, weight: 2.85, accent: '#e0445d', poster: 'stadium' },
  ];

  const CHAPTERS = SEGMENTS.filter(segment => segment.poster);
  const NAV_TIMES = { desert: 5.5, monsoon: 18, kittpeak: 32.5, stadium: 51.25 };
  const PANELS = [
    { id: 'prologue', start: 0, end: 4.35, fadeIn: 0, fadeOut: 1.5 },
    { id: 'desert', start: 2.55, end: 9.55, fadeIn: 1.25, fadeOut: 1.1 },
    { id: 'threshold-one', start: 10.05, end: 14.05, fadeIn: .85, fadeOut: .8 },
    { id: 'monsoon', start: 14.45, end: 23.55, fadeIn: 1.25, fadeOut: 1.15 },
    { id: 'threshold-two', start: 24.05, end: 28.25, fadeIn: .9, fadeOut: .8 },
    { id: 'kittpeak', start: 28.7, end: 38.15, fadeIn: 1.25, fadeOut: 1.2 },
    { id: 'threshold-three', start: 37.45, end: 44.55, fadeIn: 1, fadeOut: 1.05 },
    { id: 'stadium', start: 43.05, end: DURATION, fadeIn: 1.05, fadeOut: 0 },
  ].map(config => ({ ...config, element: document.querySelector(`[data-panel="${config.id}"]`) }));

  const root = document.documentElement;
  const stage = document.querySelector('#stage');
  const canvas = document.querySelector('#film-canvas');
  const context = canvas.getContext('2d', { alpha: false, desynchronized: true });
  const video = document.querySelector('#film-video');
  const progressFill = document.querySelector('#day-progress span');
  const progressMarker = document.querySelector('#day-progress i');
  const playButton = document.querySelector('#play');
  const playLabel = document.querySelector('#play-label');
  const playTime = document.querySelector('#play-time');
  const bufferStatus = document.querySelector('#buffer-status');
  const bufferAnnouncer = document.querySelector('#buffer-announcer');
  const sceneStatus = document.querySelector('#scene-status');
  const meridianButtons = [...document.querySelectorAll('#meridian button[data-target]')];
  const posters = new Map([...document.querySelectorAll('[data-poster]')].map(image => [image.dataset.poster, image]));
  const finalActions = document.querySelector('.final-actions');
  const finalLinks = [...finalActions.querySelectorAll('a')];
  const aboutDialog = document.querySelector('#about-dialog');
  const aboutOpen = document.querySelector('#about-open');
  const aboutClose = document.querySelector('#about-close');
  const motionPreference = matchMedia('(prefers-reduced-motion: reduce)');
  const mobileLayout = matchMedia(MOBILE_QUERY);
  const saveData = Boolean(navigator.connection?.saveData);
  const staticDocumentMode = motionPreference.matches || saveData || !('createImageBitmap' in window) || !context;

  const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));
  const smooth = value => {
    const x = clamp(value, 0, 1);
    return x * x * (3 - 2 * x);
  };
  const frameSource = index => `assets/film/f${String(index + 1).padStart(4, '0')}.webp`;
  const formatTime = seconds => {
    const value = Math.max(0, Math.round(seconds));
    return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
  };
  const emitStoryTime = (time, allowCues = false, mode = 'scroll') => {
    document.dispatchEvent(new CustomEvent('longsaturday:time', { detail: { time, allowCues, mode } }));
  };

  let viewportHeight = Math.max(1, innerHeight);
  let viewportWidth = innerWidth;
  let scrollLength = 0;
  let bands = [];
  let currentTime = 0;
  let targetTime = 0;
  let renderFrame = 0;
  let lastChapter = '';
  let playing = false;
  let playbackFrame = 0;
  let playbackUsesVideo = false;
  let framePipelineSuspended = false;
  let navigating = false;
  let navigationTimer = 0;
  let clockStartedAt = 0;
  let videoWasPrepared = false;
  let playbackAttempt = 0;
  let videoBuffering = false;
  let videoRecoveryTimer = 0;

  function layout(keepTime = null) {
    if (keepTime === null && bands.length) keepTime = timeAt(scrollY);
    viewportHeight = Math.max(1, innerHeight);
    viewportWidth = innerWidth;
    scrollLength = 0;
    bands = SEGMENTS.map(segment => {
      const length = segment.weight * viewportHeight;
      const band = { segment, y0: scrollLength, y1: scrollLength + length };
      scrollLength += length;
      return band;
    });
    document.body.style.height = `${Math.ceil(scrollLength + viewportHeight)}px`;
    sizeCanvas();
    if (keepTime !== null) scrollTo(0, yAt(keepTime));
    requestRender();
  }

  function timeAt(yPosition) {
    if (!bands.length) return 0;
    const y = clamp(yPosition, 0, Math.max(0, scrollLength - .001));
    for (const band of bands) {
      if (y < band.y1) {
        const progress = (y - band.y0) / (band.y1 - band.y0);
        return band.segment.t0 + progress * (band.segment.t1 - band.segment.t0);
      }
    }
    return DURATION;
  }

  function yAt(time) {
    if (!bands.length) return 0;
    const value = clamp(time, 0, DURATION);
    for (const band of bands) {
      if (value <= band.segment.t1) {
        const progress = (value - band.segment.t0) / (band.segment.t1 - band.segment.t0);
        return band.y0 + progress * (band.y1 - band.y0);
      }
    }
    return scrollLength;
  }

  function segmentAt(time) {
    return SEGMENTS.find(segment => time <= segment.t1) || SEGMENTS[SEGMENTS.length - 1];
  }

  function chapterAt(time) {
    const segment = segmentAt(time);
    if (segment.poster) return segment;
    const progress = (time - segment.t0) / (segment.t1 - segment.t0);
    return CHAPTERS.find(chapter => chapter.id === (progress < .52 ? segment.from : segment.to));
  }

  function accentAt(time) {
    return chapterAt(time)?.accent || '#d87348';
  }

  function panelOpacity(panel, time) {
    if (time < panel.start || time > panel.end) return 0;
    const enter = panel.fadeIn ? smooth((time - panel.start) / panel.fadeIn) : 1;
    const leave = panel.fadeOut ? smooth((panel.end - time) / panel.fadeOut) : 1;
    return Math.min(enter, leave);
  }

  function updatePanels(time) {
    let strongestPanel = null;
    let strongestOpacity = 0;
    let finaleOpacity = 0;

    for (const panel of PANELS) {
      if (!panel.element) continue;
      const opacity = panelOpacity(panel, time);
      panel.element.style.opacity = opacity.toFixed(3);
      panel.element.style.transform = `translate3d(0, ${(1 - opacity) * 18}px, 0)`;
      if (opacity > strongestOpacity) {
        strongestOpacity = opacity;
        strongestPanel = panel;
      }
      if (panel.id === 'stadium') finaleOpacity = opacity;
    }

    for (const panel of PANELS) {
      panel.element?.classList.toggle('is-active', panel === strongestPanel && strongestOpacity > .4);
    }

    const kittPeakTurn = smooth((time - 34.2) / 2.15) * smooth((38.25 - time) / .85);
    document.querySelector('[data-panel="kittpeak"]')?.style.setProperty('--turn-opacity', kittPeakTurn.toFixed(3));

    const finalePanel = document.querySelector('[data-panel="stadium"]');
    const finaleHeadline = smooth((time - 48.35) / .95);
    const finaleBody = smooth((time - 49.05) / .85);
    const finaleActionReveal = smooth((time - 50.4) / .9);
    const finaleGradient = smooth((time - 48) / 1.2);
    finalePanel?.style.setProperty('--final-headline', finaleHeadline.toFixed(3));
    finalePanel?.style.setProperty('--final-body', finaleBody.toFixed(3));
    finalePanel?.style.setProperty('--final-actions', finaleActionReveal.toFixed(3));
    finalePanel?.style.setProperty('--final-gradient', finaleGradient.toFixed(3));

    const finaleInteractive = finaleOpacity > .7 && finaleActionReveal > .72;
    if (!finaleInteractive && finalActions.contains(document.activeElement)) playButton.focus({ preventScroll: true });
    finalActions.inert = !finaleInteractive;
    finalActions.style.pointerEvents = finaleInteractive ? 'auto' : 'none';
    finalActions.setAttribute('aria-hidden', finaleInteractive ? 'false' : 'true');
    finalLinks.forEach(link => { link.tabIndex = finaleInteractive ? 0 : -1; });
  }

  function updatePosters(time) {
    const segment = segmentAt(time);
    const levels = Object.fromEntries([...posters.keys()].map(key => [key, 0]));
    if (segment.poster) {
      levels[segment.poster] = 1;
    } else {
      const progress = smooth((time - segment.t0) / (segment.t1 - segment.t0));
      levels[segment.from] = 1 - progress;
      levels[segment.to] = progress;
    }
    for (const [id, image] of posters) image.style.opacity = levels[id].toFixed(3);
  }

  function updateNavigation(time) {
    const chapter = chapterAt(time);
    const accent = accentAt(time);
    root.style.setProperty('--accent', accent);
    document.body.dataset.scene = chapter.id;

    meridianButtons.forEach(button => {
      const active = button.dataset.target === chapter.id;
      if (active) button.setAttribute('aria-current', 'step');
      else button.removeAttribute('aria-current');
    });

    if (chapter.id !== lastChapter) {
      lastChapter = chapter.id;
      const button = meridianButtons.find(item => item.dataset.target === chapter.id);
      sceneStatus.textContent = button?.getAttribute('aria-label')?.replace('Go to ', '') || '';
    }
  }

  function updateProgress(time) {
    const progress = clamp(scrollLength ? scrollY / scrollLength : time / DURATION, 0, 1);
    progressFill.style.transform = `scaleX(${progress.toFixed(5)})`;
    progressMarker.style.left = `${(progress * 100).toFixed(3)}%`;
  }

  /* Bounded frame decoder: no global sweep, no retained compressed-blob store. */
  const reportedMemory = navigator.deviceMemory;
  const lowMemory = mobileLayout.matches || reportedMemory === undefined || reportedMemory <= 4;
  const BACK_WINDOW = lowMemory ? 5 : 8;
  const FORWARD_WINDOW = lowMemory ? 10 : 16;
  const MAX_LOADS = lowMemory ? 3 : 4;
  const bitmaps = new Map();
  const pendingFrames = new Map();
  const activeFrames = new Map();
  const seenFrames = new Uint8Array(FRAME_COUNT);
  let seenCount = 0;
  let activeLoads = 0;
  let wantedFrame = 0;
  let queuedCenter = -999;
  let paintedFrame = -999;
  let frameFailures = 0;
  let canvasWidth = 0;
  let canvasHeight = 0;
  let staticReason = '';
  let announcedReady = false;
  let lastStaticAnnouncement = '';

  let frameMode = !staticDocumentMode;
  if (!frameMode) staticReason = motionPreference.matches ? 'Reduced-motion still story' : saveData ? 'Data-saver still story' : 'Still story';

  function sizeCanvas() {
    const rect = stage.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const scale = Math.max(.35, Math.min(devicePixelRatio || 1, 1280 / rect.width, 720 / rect.height));
    canvasWidth = Math.max(1, Math.round(rect.width * scale));
    canvasHeight = Math.max(1, Math.round(rect.height * scale));
    if (canvas.width !== canvasWidth || canvas.height !== canvasHeight) {
      canvas.width = canvasWidth;
      canvas.height = canvasHeight;
      paintedFrame = -999;
      canvas.classList.remove('is-ready');
    }
  }

  function queueFrame(index, priority = 0) {
    if (!frameMode || framePipelineSuspended || index < 0 || index >= FRAME_COUNT || bitmaps.has(index) || activeFrames.has(index)) return;
    const previousPriority = pendingFrames.get(index);
    if (previousPriority === undefined || priority < previousPriority) pendingFrames.set(index, priority);
    pumpFrameQueue();
  }

  function pumpFrameQueue() {
    while (frameMode && !framePipelineSuspended && activeLoads < MAX_LOADS && pendingFrames.size) {
      let selectedIndex = -1;
      let selectedPriority = Infinity;
      for (const [index, priority] of pendingFrames) {
        if (priority < selectedPriority) {
          selectedIndex = index;
          selectedPriority = priority;
        }
      }
      pendingFrames.delete(selectedIndex);
      loadFrame(selectedIndex);
    }
  }

  async function loadFrame(index) {
    const controller = new AbortController();
    let timedOut = false;
    const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, 9000);
    activeFrames.set(index, controller);
    activeLoads += 1;
    try {
      const response = await fetch(frameSource(index), { signal: controller.signal, cache: 'force-cache' });
      if (!response.ok) throw new Error(`Frame ${index + 1} returned ${response.status}`);
      const blob = await response.blob();
      const bitmap = await createImageBitmap(blob);
      if (!seenFrames[index]) {
        seenFrames[index] = 1;
        seenCount += 1;
      }
      const stillWanted = frameMode && !controller.signal.aborted && !framePipelineSuspended && Math.abs(index - wantedFrame) <= FORWARD_WINDOW + BACK_WINDOW + 5;
      if (stillWanted) bitmaps.set(index, bitmap);
      else bitmap.close();
      frameFailures = 0;
    } catch (error) {
      if (error?.name !== 'AbortError' || timedOut) {
        frameFailures += 1;
        if (frameFailures >= 5) enableStaticMode('Film frames unavailable — showing still story');
      }
    } finally {
      clearTimeout(timeout);
      activeFrames.delete(index);
      activeLoads -= 1;
      updateBufferStatus();
      requestRender();
      pumpFrameQueue();
    }
  }

  function tendFrameWindow(center) {
    if (!frameMode || framePipelineSuspended || playbackUsesVideo || navigating) return;
    wantedFrame = center;
    const jumped = Math.abs(center - queuedCenter) > FORWARD_WINDOW + 5;
    if (jumped) {
      pendingFrames.clear();
      for (const [index, controller] of activeFrames) {
        if (Math.abs(index - center) > FORWARD_WINDOW * 2) controller.abort();
      }
      if (Math.abs(paintedFrame - center) > 4) canvas.classList.remove('is-ready');
    }
    queuedCenter = center;

    const retainStart = center - BACK_WINDOW - 4;
    const retainEnd = center + FORWARD_WINDOW + 4;
    for (const [index] of pendingFrames) {
      if (index < retainStart || index > retainEnd) pendingFrames.delete(index);
      else pendingFrames.set(index, Math.abs(index - center) + (index < center ? .25 : 0));
    }
    for (const [index, controller] of activeFrames) {
      if (index < retainStart || index > retainEnd) controller.abort();
    }

    for (const [index, bitmap] of bitmaps) {
      if (index < center - BACK_WINDOW - 5 || index > center + FORWARD_WINDOW + 5) {
        bitmap.close();
        bitmaps.delete(index);
      }
    }

    queueFrame(center, 0);
    for (let distance = 1; distance <= FORWARD_WINDOW; distance += 1) {
      queueFrame(center + distance, distance);
      if (distance <= BACK_WINDOW) queueFrame(center - distance, distance + .25);
    }
    updateBufferStatus();
  }

  function nearestBitmap(center) {
    if (bitmaps.has(center)) return { bitmap: bitmaps.get(center), index: center };
    for (let distance = 1; distance <= 2; distance += 1) {
      if (bitmaps.has(center - distance)) return { bitmap: bitmaps.get(center - distance), index: center - distance };
      if (bitmaps.has(center + distance)) return { bitmap: bitmaps.get(center + distance), index: center + distance };
    }
    return null;
  }

  function paint(center) {
    if (!frameMode || framePipelineSuspended || playbackUsesVideo || navigating || !canvasWidth || !canvasHeight) return;
    const candidate = nearestBitmap(center);
    if (!candidate) {
      if (Math.abs(paintedFrame - center) > 3) canvas.classList.remove('is-ready');
      return;
    }
    if (candidate.index === paintedFrame && canvas.classList.contains('is-ready')) return;

    const bitmap = candidate.bitmap;
    const ultrawide = stage.clientWidth / Math.max(1, stage.clientHeight) > 2;
    const scale = ultrawide
      ? Math.min(canvasWidth / bitmap.width, canvasHeight / bitmap.height)
      : Math.max(canvasWidth / bitmap.width, canvasHeight / bitmap.height);
    const width = bitmap.width * scale;
    const height = bitmap.height * scale;
    context.fillStyle = '#050606';
    context.fillRect(0, 0, canvasWidth, canvasHeight);
    context.drawImage(bitmap, (canvasWidth - width) / 2, (canvasHeight - height) / 2, width, height);
    paintedFrame = candidate.index;
    canvas.classList.add('is-ready');
  }

  function updateBufferStatus() {
    if (!frameMode) {
      bufferStatus.textContent = staticReason;
      bufferStatus.classList.remove('is-quiet');
      if (staticReason && staticReason !== lastStaticAnnouncement) {
        lastStaticAnnouncement = staticReason;
        bufferAnnouncer.textContent = staticReason;
      }
      return;
    }
    const start = Math.max(0, wantedFrame - 2);
    const end = Math.min(FRAME_COUNT - 1, wantedFrame + Math.min(8, FORWARD_WINDOW));
    let available = 0;
    for (let index = start; index <= end; index += 1) if (bitmaps.has(index)) available += 1;
    const total = end - start + 1;
    const percent = Math.round(available / total * 100);
    if (available && bitmaps.has(wantedFrame)) {
      bufferStatus.textContent = 'Film ready';
      bufferStatus.classList.add('is-quiet');
      if (!announcedReady) {
        announcedReady = true;
        bufferAnnouncer.textContent = 'Film ready';
      }
    } else {
      bufferStatus.textContent = `Buffering nearby frames · ${percent}%`;
      bufferStatus.classList.remove('is-quiet');
    }
  }

  function enableStaticMode(reason) {
    frameMode = false;
    staticReason = reason;
    pendingFrames.clear();
    for (const controller of activeFrames.values()) controller.abort();
    for (const bitmap of bitmaps.values()) bitmap.close();
    bitmaps.clear();
    canvas.classList.remove('is-ready');
    updateBufferStatus();
  }

  function suspendFramePipeline() {
    framePipelineSuspended = true;
    pendingFrames.clear();
    for (const controller of activeFrames.values()) controller.abort();
    for (const bitmap of bitmaps.values()) bitmap.close();
    bitmaps.clear();
    paintedFrame = -999;
    canvas.classList.remove('is-ready');
  }

  function resumeFramePipeline() {
    framePipelineSuspended = false;
    requestRender();
    pumpFrameQueue();
  }

  function render() {
    renderFrame = 0;
    targetTime = timeAt(scrollY);
    const difference = targetTime - currentTime;
    currentTime = Math.abs(difference) < .003 ? targetTime : currentTime + difference * .3;

    updatePanels(currentTime);
    updatePosters(currentTime);
    updateNavigation(currentTime);
    updateProgress(currentTime);

    if (!playing) {
      const atEnd = currentTime >= DURATION - .08;
      setPlayState(atEnd ? 'done' : 'idle', atEnd ? DURATION : DURATION - currentTime);
      emitStoryTime(currentTime, false, 'seek');
    }

    if (frameMode && !playbackUsesVideo && !framePipelineSuspended) {
      const frame = clamp(Math.round(currentTime * FPS), 0, FRAME_COUNT - 1);
      tendFrameWindow(frame);
      paint(frame);
    }

    if (Math.abs(targetTime - currentTime) >= .003) requestRender();
  }

  function requestRender() {
    if (root.classList.contains('static-story')) return;
    if (!renderFrame) renderFrame = requestAnimationFrame(render);
  }

  /* Play mode uses the baked master video only after an explicit click. */
  function setPlayState(state, remaining = DURATION) {
    const active = state === 'playing' || state === 'loading' || state === 'buffering';
    const soundAvailable = Boolean(window.longSaturdaySoundscape);
    const startLabel = remaining < DURATION - .25 ? 'Resume' : soundAvailable ? 'Play with sound' : 'Play story';
    playButton.setAttribute('aria-pressed', active ? 'true' : 'false');
    playLabel.textContent = state === 'loading' ? 'Starting story' : state === 'buffering' ? 'Buffering' : state === 'playing' ? 'Pause' : state === 'done' ? 'Replay' : startLabel;
    playTime.textContent = formatTime(remaining);
    playButton.setAttribute('aria-label', state === 'playing' ? `Pause the story with ${formatTime(remaining)} remaining` : state === 'buffering' ? 'The film is buffering' : state === 'loading' ? 'Starting the story' : state === 'done' ? `Replay the 52-second story${soundAvailable ? ' with sound' : ''}` : `${startLabel} — 52-second story`);
  }

  function waitForVideo(eventName, timeout = 12000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => finish(new Error('Video timed out')), timeout);
      const onEvent = () => finish();
      const onError = () => finish(new Error('Video failed'));
      function finish(error) {
        clearTimeout(timer);
        video.removeEventListener(eventName, onEvent);
        video.removeEventListener('error', onError);
        error ? reject(error) : resolve();
      }
      video.addEventListener(eventName, onEvent, { once: true });
      video.addEventListener('error', onError, { once: true });
    });
  }

  async function prepareVideo(startTime, attempt) {
    try {
      if (!videoWasPrepared) {
        video.src = 'assets/vid/real/master-web.mp4';
        video.load();
        videoWasPrepared = true;
      }
      if (video.readyState < 1) await waitForVideo('loadedmetadata');
      if (!playing || attempt !== playbackAttempt) return false;
      if (Math.abs(video.currentTime - startTime) > .04) {
        const seeked = waitForVideo('seeked', 6000);
        video.currentTime = startTime;
        await seeked;
      }
      if (!playing || attempt !== playbackAttempt) return false;
      if (video.readyState < 3) await waitForVideo('canplay');
      if (!playing || attempt !== playbackAttempt) return false;
      return true;
    } catch {
      if (attempt === playbackAttempt) {
        playbackUsesVideo = false;
        video.pause();
        video.classList.remove('is-playing');
        video.removeAttribute('src');
        video.load();
        videoWasPrepared = false;
      }
      return false;
    }
  }

  async function startPreparedVideo(attempt) {
    let playTimer = 0;
    try {
      const playRequest = Promise.resolve(video.play());
      playRequest.catch(() => {});
      await Promise.race([
        playRequest,
        new Promise((_, reject) => { playTimer = setTimeout(() => reject(new Error('Video play timed out')), 3000); }),
      ]);
      clearTimeout(playTimer);
      if (!playing || attempt !== playbackAttempt) return false;
      playbackUsesVideo = true;
      videoBuffering = false;
      video.classList.add('is-playing');
      canvas.classList.remove('is-ready');
      return true;
    } catch {
      clearTimeout(playTimer);
      if (attempt === playbackAttempt) {
        playbackUsesVideo = false;
        video.pause();
        video.classList.remove('is-playing');
        video.removeAttribute('src');
        video.load();
        videoWasPrepared = false;
      }
      return false;
    }
  }

  async function startPlayback() {
    cancelNavigationMotion();
    const attempt = ++playbackAttempt;
    let startTime = timeAt(scrollY);
    if (startTime >= DURATION - .12) {
      startTime = 0;
      scrollTo(0, 0);
      currentTime = 0;
    }
    playing = true;
    playbackUsesVideo = false;
    emitStoryTime(startTime, false, 'seek');
    try {
      window.longSaturdaySoundscape?.preparePlayback(startTime);
    } catch (error) {
      console.warn('The optional soundtrack could not prepare. Continuing silently.', error);
    }
    if (frameMode) suspendFramePipeline();
    setPlayState('loading', DURATION - startTime);

    const videoReady = !motionPreference.matches && !saveData ? prepareVideo(startTime, attempt) : Promise.resolve(false);
    const preparedVideo = await videoReady;
    if (!playing || attempt !== playbackAttempt) return;
    const useVideo = preparedVideo && await startPreparedVideo(attempt);
    if (!playing || attempt !== playbackAttempt) return;
    if (!useVideo && frameMode) resumeFramePipeline();
    const playbackStart = useVideo ? video.currentTime : startTime;
    clockStartedAt = performance.now() - playbackStart * 1000;
    window.longSaturdaySoundscape?.beginPlayback(playbackStart);
    setPlayState('playing', DURATION - playbackStart);
    if (!useVideo) video.classList.remove('is-playing');
    cancelAnimationFrame(playbackFrame);
    playbackFrame = requestAnimationFrame(playbackStep);
  }

  function playbackStep(timestamp) {
    if (!playing) return;
    const time = playbackUsesVideo ? video.currentTime : clamp((timestamp - clockStartedAt) / 1000, 0, DURATION);
    scrollTo(0, yAt(time));
    emitStoryTime(time, true, 'play');
    if (!videoBuffering) setPlayState('playing', DURATION - time);
    if (time >= DURATION - .025 || (playbackUsesVideo && video.ended)) {
      stopPlayback('done');
      scrollTo(0, scrollLength);
      return;
    }
    playbackFrame = requestAnimationFrame(playbackStep);
  }

  function stopPlayback(state = 'idle') {
    const wasPlaying = playing;
    const stoppedAt = playbackUsesVideo ? video.currentTime : timeAt(scrollY);
    const shouldResumeFrames = framePipelineSuspended;
    playbackAttempt += 1;
    playing = false;
    videoBuffering = false;
    clearTimeout(videoRecoveryTimer);
    cancelAnimationFrame(playbackFrame);
    video.pause();
    video.classList.remove('is-playing');
    playbackUsesVideo = false;
    if (wasPlaying) window.longSaturdaySoundscape?.endPlayback({ natural: state === 'done', time: state === 'done' ? DURATION : stoppedAt });
    if (frameMode && shouldResumeFrames) resumeFramePipeline();
    const remaining = state === 'done' ? DURATION : DURATION - timeAt(scrollY);
    setPlayState(state, remaining);
    requestRender();
  }

  function manualInterruption(event) {
    if (navigating && !event.target.closest?.('#meridian')) cancelNavigationMotion();
    const onTransport = event.target.closest?.('.transport-control');
    const pointerActivation = event.type === 'pointerdown' || event.type === 'touchstart';
    const keyboardActivation = event.type === 'keydown' && (event.key === 'Enter' || event.key === ' ');
    if (!playing) {
      if (!onTransport) document.dispatchEvent(new CustomEvent('longsaturday:interrupt'));
      return;
    }
    if (onTransport && (pointerActivation || keyboardActivation)) return;
    stopPlayback();
  }

  playButton.addEventListener('click', () => playing ? stopPlayback() : startPlayback());
  addEventListener('wheel', manualInterruption, { passive: true });
  addEventListener('touchstart', manualInterruption, { passive: true });
  addEventListener('pointerdown', manualInterruption, { passive: true });
  addEventListener('keydown', manualInterruption);
  addEventListener('scroll', requestRender, { passive: true });
  document.addEventListener('visibilitychange', () => { if (document.hidden && playing) stopPlayback(); });

  function fallBackFromVideo(resetVideo = false) {
    if (!playing || !playbackUsesVideo) return;
    const mediaTime = Number.isFinite(video.currentTime) ? clamp(video.currentTime, 0, DURATION) : timeAt(scrollY);
    clearTimeout(videoRecoveryTimer);
    playbackUsesVideo = false;
    videoBuffering = false;
    video.pause();
    video.classList.remove('is-playing');
    if (resetVideo) {
      video.removeAttribute('src');
      video.load();
      videoWasPrepared = false;
    }
    if (frameMode && framePipelineSuspended) resumeFramePipeline();
    clockStartedAt = performance.now() - mediaTime * 1000;
    window.longSaturdaySoundscape?.holdPlayback(mediaTime);
    window.longSaturdaySoundscape?.resumePlayback(mediaTime);
    setPlayState('playing', DURATION - mediaTime);
  }

  function armVideoRecovery() {
    clearTimeout(videoRecoveryTimer);
    const stalledAt = video.currentTime;
    videoRecoveryTimer = setTimeout(() => {
      if (!playing || !playbackUsesVideo) return;
      if (Math.abs(video.currentTime - stalledAt) < .05) {
        fallBackFromVideo(true);
      } else if (videoBuffering) {
        videoBuffering = false;
        window.longSaturdaySoundscape?.resumePlayback(video.currentTime);
        setPlayState('playing', DURATION - video.currentTime);
      }
    }, 2500);
  }

  function handleVideoWaiting() {
    if (playing && playbackUsesVideo) {
      videoBuffering = true;
      window.longSaturdaySoundscape?.holdPlayback(video.currentTime);
      setPlayState('buffering', DURATION - video.currentTime);
      armVideoRecovery();
    }
  }

  video.addEventListener('waiting', handleVideoWaiting);
  video.addEventListener('stalled', () => {
    if (playing && playbackUsesVideo) armVideoRecovery();
  });
  video.addEventListener('playing', () => {
    if (playing) {
      clearTimeout(videoRecoveryTimer);
      videoBuffering = false;
      window.longSaturdaySoundscape?.resumePlayback(video.currentTime);
      setPlayState('playing', DURATION - video.currentTime);
    }
  });
  video.addEventListener('error', () => fallBackFromVideo(true));
  video.addEventListener('abort', () => fallBackFromVideo(true));

  meridianButtons.forEach(button => {
    button.addEventListener('click', () => {
      stopPlayback();
      const chapter = CHAPTERS.find(item => item.id === button.dataset.target);
      if (!chapter) return;
      beginNavigation();
      scrollTo({ top: yAt(NAV_TIMES[chapter.id]), behavior: motionPreference.matches ? 'auto' : 'smooth' });
    });
  });

  document.querySelectorAll('[data-replay], .wordmark').forEach(link => {
    link.addEventListener('click', event => {
      event.preventDefault();
      stopPlayback();
      document.dispatchEvent(new CustomEvent('longsaturday:reset'));
      beginNavigation();
      scrollTo({ top: 0, behavior: motionPreference.matches ? 'auto' : 'smooth' });
    });
  });

  function beginNavigation() {
    navigating = true;
    document.dispatchEvent(new CustomEvent('longsaturday:interrupt'));
    clearTimeout(navigationTimer);
    pendingFrames.clear();
    for (const controller of activeFrames.values()) controller.abort();
    canvas.classList.remove('is-ready');
    navigationTimer = setTimeout(finishNavigation, motionPreference.matches ? 50 : 900);
  }

  function finishNavigation() {
    navigating = false;
    clearTimeout(navigationTimer);
    requestRender();
  }

  function cancelNavigationMotion() {
    const top = scrollY;
    scrollTo({ top, left: scrollX, behavior: 'auto' });
    finishNavigation();
  }

  aboutOpen.addEventListener('click', () => {
    stopPlayback();
    aboutDialog.showModal();
  });
  aboutClose.addEventListener('click', () => aboutDialog.close());
  aboutDialog.addEventListener('click', event => { if (event.target === aboutDialog) aboutDialog.close(); });

  motionPreference.addEventListener?.('change', () => location.reload());

  let resizeFrame = 0;
  addEventListener('resize', () => {
    cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(() => {
      if (root.classList.contains('static-story')) return;
      const widthChanged = Math.abs(innerWidth - viewportWidth) > 8;
      const mobile = mobileLayout.matches;
      if (widthChanged || !mobile) layout(timeAt(scrollY));
      else {
        document.body.style.height = `${Math.ceil(scrollLength + innerHeight)}px`;
        sizeCanvas();
      }
    });
  });

  finalLinks.forEach(link => { link.tabIndex = -1; });
  finalActions.inert = true;
  finalActions.style.pointerEvents = 'none';
  finalActions.setAttribute('aria-hidden', 'true');
  try {
    root.classList.replace('no-js', 'js');
    if (staticDocumentMode) {
      root.classList.add('static-story');
      document.body.style.height = '';
      finalLinks.forEach(link => { link.tabIndex = 0; });
      finalActions.inert = false;
      finalActions.style.pointerEvents = 'auto';
      finalActions.setAttribute('aria-hidden', 'false');
      return;
    }
    layout(0);
    currentTime = timeAt(scrollY);
    updateBufferStatus();
    requestRender();
    addEventListener('load', () => {
      if (!playing) setPlayState(currentTime >= DURATION - .08 ? 'done' : 'idle', currentTime >= DURATION - .08 ? DURATION : DURATION - currentTime);
    }, { once: true });
    addEventListener('pageshow', () => {
      if (!location.hash) {
        scrollTo(0, 0);
        currentTime = 0;
        requestRender();
      }
    }, { once: true });
  } catch (error) {
    root.classList.remove('js', 'static-story');
    root.classList.add('no-js');
    document.body.style.height = '';
    finalLinks.forEach(link => { link.tabIndex = 0; });
    finalActions.inert = false;
    finalActions.style.pointerEvents = 'auto';
    finalActions.setAttribute('aria-hidden', 'false');
    console.error('The enhanced story could not start; showing the readable edition.', error);
  }
})();
