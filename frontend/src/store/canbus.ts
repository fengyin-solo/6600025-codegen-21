import { defineStore } from 'pinia';
import { ref, computed, watch } from 'vue';
import type { CanFrame, DbcMessage, BusStats, FrameBookmark } from '../types';
import { parseDbc, decodeCanFrame, DEFAULT_DBC_CONTENT } from '../utils/dbc-parser';

let frameIdCounter = 0;
let bookmarkIdCounter = 0;

const BOOKMARK_COLORS = ['#ef4444', '#f59e0b', '#22c55e', '#06b6d4', '#8b5cf6', '#ec4899'];
const BOOKMARK_STORAGE_KEY = 'canbus_bookmarks_v1';

export const useCanBusStore = defineStore('canbus', () => {
  const frames = ref<CanFrame[]>([]);
  const signals = ref<Map<string, { name: string; data: { time: number; value: number }[] }>>(new Map());
  const dbcMessages = ref<Map<number, DbcMessage>>(new Map());
  const filterId = ref('');
  const filterText = ref('');
  const isCapturing = ref(false);
  const pollInterval = ref<number | null>(null);
  const bookmarks = ref<FrameBookmark[]>([]);
  const focusedTimestamp = ref<number | null>(null);

  const busStats = ref<BusStats>({
    totalFrames: 0,
    rxCount: 0,
    txCount: 0,
    errorCount: 0,
    busLoad: 0,
    lastUpdate: Date.now()
  });

  const filteredFrames = computed(() => {
    let result = frames.value;

    if (filterId.value.trim()) {
      const idFilter = filterId.value.trim().toLowerCase().replace(/^0x/, '');
      result = result.filter(f =>
        f.arbitrationId.toString(16).toLowerCase().includes(idFilter)
      );
    }

    if (filterText.value.trim()) {
      const textFilter = filterText.value.trim().toLowerCase();
      result = result.filter(f => {
        if (f.arbitrationId.toString(16).toLowerCase().includes(textFilter)) return true;
        if (f.data.toLowerCase().includes(textFilter)) return true;
        for (const key of Object.keys(f.decoded)) {
          if (key.toLowerCase().includes(textFilter)) return true;
        }
        return false;
      });
    }

    return result;
  });

  const busLoadPercent = computed(() => {
    return busStats.value.busLoad.toFixed(1);
  });

  function addFrame(frame: CanFrame) {
    frames.value.push(frame);
    if (frames.value.length > 500) {
      frames.value = frames.value.slice(-500);
    }

    busStats.value.totalFrames++;
    if (frame.direction === 'RX') busStats.value.rxCount++;
    else busStats.value.txCount++;
    busStats.value.lastUpdate = Date.now();

    // Update signal history
    const msgDef = dbcMessages.value.get(frame.arbitrationId);
    if (msgDef) {
      const decoded = decodeCanFrame(frame, msgDef);
      frame.decoded = decoded;
      for (const [name, value] of Object.entries(decoded)) {
        if (!signals.value.has(name)) {
          signals.value.set(name, { name, data: [] });
        }
        const sig = signals.value.get(name)!;
        sig.data.push({ time: frame.timestamp, value });
        if (sig.data.length > 100) {
          sig.data = sig.data.slice(-100);
        }
      }
    }

    // Simulate bus load (random 15-45%)
    busStats.value.busLoad = 15 + Math.random() * 30;
  }

  function clearFrames() {
    frames.value = [];
    signals.value = new Map();
    focusedTimestamp.value = null;
    busStats.value = {
      totalFrames: 0,
      rxCount: 0,
      txCount: 0,
      errorCount: 0,
      busLoad: 0,
      lastUpdate: Date.now()
    };
    frameIdCounter = 0;
  }

  function loadBookmarksFromStorage() {
    try {
      if (typeof localStorage === 'undefined') return;
      const raw = localStorage.getItem(BOOKMARK_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return;
      const restored: FrameBookmark[] = parsed
        .filter((b: any): b is FrameBookmark =>
          b && typeof b.id === 'string' && typeof b.frameId === 'string' &&
          typeof b.timestamp === 'number' && typeof b.note === 'string' &&
          typeof b.createdAt === 'number' && typeof b.color === 'string'
        )
        .map(b => ({ ...b }));
      restored.sort((a, b) => a.timestamp - b.timestamp);
      bookmarks.value = restored;
      bookmarkIdCounter = restored.reduce((max, b) => {
        const m = b.id.match(/bookmark-(\d+)/);
        return m ? Math.max(max, parseInt(m[1], 10)) : max;
      }, 0);
    } catch (e) {
      console.warn('[canbus] Failed to load bookmarks from storage:', e);
    }
  }

  function saveBookmarksToStorage() {
    try {
      if (typeof localStorage === 'undefined') return;
      localStorage.setItem(BOOKMARK_STORAGE_KEY, JSON.stringify(bookmarks.value));
    } catch (e) {
      console.warn('[canbus] Failed to save bookmarks to storage:', e);
    }
  }

  function addBookmark(frameId: string, note: string = ''): FrameBookmark | null {
    const frame = frames.value.find(f => f.id === frameId);
    if (!frame) return null;
    const existing = bookmarks.value.find(b => b.frameId === frameId);
    if (existing) return existing;
    const color = BOOKMARK_COLORS[bookmarks.value.length % BOOKMARK_COLORS.length];
    const bookmark: FrameBookmark = {
      id: `bookmark-${++bookmarkIdCounter}`,
      frameId,
      timestamp: frame.timestamp,
      note,
      createdAt: Date.now(),
      color
    };
    bookmarks.value.push(bookmark);
    bookmarks.value.sort((a, b) => a.timestamp - b.timestamp);
    return bookmark;
  }

  function removeBookmark(bookmarkId: string) {
    const idx = bookmarks.value.findIndex(b => b.id === bookmarkId);
    if (idx !== -1) {
      bookmarks.value.splice(idx, 1);
    }
  }

  function updateBookmarkNote(bookmarkId: string, note: string) {
    const bookmark = bookmarks.value.find(b => b.id === bookmarkId);
    if (bookmark) {
      bookmark.note = note;
    }
  }

  function jumpToBookmark(bookmarkId: string) {
    const bookmark = bookmarks.value.find(b => b.id === bookmarkId);
    if (bookmark) {
      focusedTimestamp.value = bookmark.timestamp;
      setTimeout(() => {
        focusedTimestamp.value = null;
      }, 2000);
    }
  }

  function hasBookmark(frameId: string): boolean {
    return bookmarks.value.some(b => b.frameId === frameId);
  }

  function getBookmarkByFrameId(frameId: string): FrameBookmark | undefined {
    return bookmarks.value.find(b => b.frameId === frameId);
  }

  function clearFocus() {
    focusedTimestamp.value = null;
  }

  function loadMockDbc() {
    parseAndLoadDbc(DEFAULT_DBC_CONTENT);
  }

  function parseAndLoadDbc(text: string) {
    dbcMessages.value = parseDbc(text);
  }

  function generateMockFrame(): CanFrame {
    const messageIds = Array.from(dbcMessages.value.keys());
    const arbId = messageIds.length > 0
      ? messageIds[Math.floor(Math.random() * messageIds.length)]
      : 0x7DF;

    const msgDef = dbcMessages.value.get(arbId);

    // Generate realistic OBD-II values
    const rpm = Math.floor(800 + Math.random() * 5200);
    const speed = Math.floor(Math.random() * 120);
    const temp = Math.floor(70 + Math.random() * 35);
    const throttle = Math.floor(Math.random() * 100);
    const load = Math.floor(Math.random() * 100);

    // Encode values into bytes (simplified encoding for display)
    const rpmRaw = Math.round(rpm / 0.25);
    const rpmLow = rpmRaw & 0xFF;
    const rpmHigh = (rpmRaw >> 8) & 0xFF;
    const speedByte = speed & 0xFF;
    const tempByte = (temp + 40) & 0xFF;
    const throttleByte = Math.round(throttle / 0.392) & 0xFF;
    const loadByte = Math.round(load / 0.392) & 0xFF;

    const dataBytes = [rpmLow, rpmHigh, speedByte, tempByte, throttleByte, loadByte, 0x00, 0x00];
    const dataHex = dataBytes.map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');

    const frame: CanFrame = {
      id: `frame-${++frameIdCounter}`,
      timestamp: Date.now(),
      arbitrationId: arbId,
      dlc: 8,
      data: dataHex,
      decoded: {},
      direction: Math.random() > 0.3 ? 'RX' : 'TX'
    };

    if (msgDef) {
      frame.decoded = {
        EngineRPM: rpm,
        VehicleSpeed: speed,
        CoolantTemp: temp,
        ThrottlePosition: throttle,
        EngineLoad: load
      };
    }

    return frame;
  }

  function startCapture() {
    if (isCapturing.value) return;
    isCapturing.value = true;

    // Load mock DBC if not loaded
    if (dbcMessages.value.size === 0) {
      loadMockDbc();
    }

    pollInterval.value = window.setInterval(() => {
      const frame = generateMockFrame();
      addFrame(frame);
    }, 200);
  }

  function stopCapture() {
    isCapturing.value = false;
    if (pollInterval.value !== null) {
      clearInterval(pollInterval.value);
      pollInterval.value = null;
    }
  }

  function decodeFrame(frame: CanFrame): Record<string, number> {
    const msgDef = dbcMessages.value.get(frame.arbitrationId);
    if (!msgDef) return {};
    return decodeCanFrame(frame, msgDef);
  }

  function exportFrames(): string {
    const header = 'Timestamp,Direction,CAN_ID,DLC,Data,Decoded\n';
    const rows = frames.value.map(f => {
      const decodedStr = Object.entries(f.decoded)
        .map(([k, v]) => `${k}=${v}`)
        .join('; ');
      return `${f.timestamp},${f.direction},0x${f.arbitrationId.toString(16).toUpperCase()},${f.dlc},"${f.data}","${decodedStr}"`;
    }).join('\n');
    return header + rows;
  }

  loadBookmarksFromStorage();
  watch(bookmarks, saveBookmarksToStorage, { deep: true });

  return {
    frames,
    signals,
    dbcMessages,
    filterId,
    filterText,
    busStats,
    isCapturing,
    bookmarks,
    focusedTimestamp,
    filteredFrames,
    busLoadPercent,
    addFrame,
    clearFrames,
    loadMockDbc,
    parseAndLoadDbc,
    startCapture,
    stopCapture,
    decodeFrame,
    exportFrames,
    addBookmark,
    removeBookmark,
    updateBookmarkNote,
    jumpToBookmark,
    hasBookmark,
    getBookmarkByFrameId,
    clearFocus
  };
});
