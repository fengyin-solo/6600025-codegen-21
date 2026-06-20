<script setup lang="ts">
import { ref } from 'vue';
import { useCanBusStore } from '../store/canbus';
import type { FrameBookmark } from '../types';

const store = useCanBusStore();
const editingId = ref<string | null>(null);
const editingNote = ref('');

function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString('zh-CN', { hour12: false }) + '.' + d.getMilliseconds().toString().padStart(3, '0');
}

function startEdit(bookmark: FrameBookmark) {
  editingId.value = bookmark.id;
  editingNote.value = bookmark.note;
}

function saveEdit(bookmark: FrameBookmark) {
  store.updateBookmarkNote(bookmark.id, editingNote.value);
  editingId.value = null;
  editingNote.value = '';
}

function cancelEdit() {
  editingId.value = null;
  editingNote.value = '';
}

function handleJump(bookmark: FrameBookmark) {
  store.jumpToBookmark(bookmark.id);
}

function handleDelete(bookmark: FrameBookmark) {
  store.removeBookmark(bookmark.id);
  if (editingId.value === bookmark.id) {
    editingId.value = null;
    editingNote.value = '';
  }
}
</script>

<template>
  <div class="flex flex-col h-full bg-gray-900">
    <div class="px-4 py-2 bg-gray-800 border-b border-gray-700 flex items-center justify-between">
      <h3 class="text-sm font-semibold text-gray-300 flex items-center gap-2">
        <svg class="w-4 h-4 text-yellow-400" fill="currentColor" viewBox="0 0 20 20">
          <path d="M5 4a2 2 0 012-2h6a2 2 0 012 2v14l-5-2.5L5 18V4z" />
        </svg>
        帧书签
      </h3>
      <span class="text-xs text-gray-500">{{ store.bookmarks.length }} 个书签</span>
    </div>

    <div class="flex-1 overflow-auto">
      <div v-if="store.bookmarks.length === 0" class="flex flex-col items-center justify-center h-full text-gray-600 text-sm px-4 text-center">
        <svg class="w-10 h-10 mb-2 opacity-50" fill="currentColor" viewBox="0 0 20 20">
          <path d="M5 4a2 2 0 012-2h6a2 2 0 012 2v14l-5-2.5L5 18V4z" />
        </svg>
        <p>暂无书签</p>
        <p class="text-xs mt-1 text-gray-700">在帧表格中点击书签图标添加</p>
      </div>

      <div v-else class="py-1">
        <div
          v-for="bookmark in store.bookmarks"
          :key="bookmark.id"
          class="px-3 py-2 border-b border-gray-800 hover:bg-gray-800/50 transition-colors group"
        >
          <div class="flex items-start gap-2">
            <div
              class="w-2 h-2 rounded-full mt-1.5 shrink-0"
              :style="{ backgroundColor: bookmark.color }"
            ></div>
            <div class="flex-1 min-w-0">
              <div class="flex items-center justify-between gap-2">
                <span class="text-xs text-gray-400 font-mono">{{ formatTime(bookmark.timestamp) }}</span>
                <div class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    @click="handleJump(bookmark)"
                    class="p-1 rounded hover:bg-gray-700 text-cyan-400 hover:text-cyan-300 transition-colors"
                    title="跳转到曲线位置"
                  >
                    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                  </button>
                  <button
                    v-if="editingId !== bookmark.id"
                    @click="startEdit(bookmark)"
                    class="p-1 rounded hover:bg-gray-700 text-gray-400 hover:text-yellow-400 transition-colors"
                    title="编辑备注"
                  >
                    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                  </button>
                  <button
                    @click="handleDelete(bookmark)"
                    class="p-1 rounded hover:bg-gray-700 text-gray-400 hover:text-red-400 transition-colors"
                    title="删除书签"
                  >
                    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              </div>

              <div v-if="editingId === bookmark.id" class="mt-1.5">
                <div class="flex gap-1">
                  <input
                    v-model="editingNote"
                    type="text"
                    placeholder="输入备注..."
                    class="flex-1 px-2 py-1 bg-gray-900 border border-gray-600 rounded text-gray-100 text-xs focus:outline-none focus:border-cyan-500"
                    @keyup.enter="saveEdit(bookmark)"
                    @keyup.esc="cancelEdit"
                    autofocus
                  />
                  <button
                    @click="saveEdit(bookmark)"
                    class="px-2 py-1 bg-cyan-600 hover:bg-cyan-500 text-white text-xs rounded transition-colors"
                  >
                    保存
                  </button>
                  <button
                    @click="cancelEdit"
                    class="px-2 py-1 bg-gray-700 hover:bg-gray-600 text-gray-300 text-xs rounded transition-colors"
                  >
                    取消
                  </button>
                </div>
              </div>
              <div v-else-if="bookmark.note" class="mt-0.5 text-xs text-gray-300 break-words">
                {{ bookmark.note }}
              </div>
              <div v-else class="mt-0.5 text-xs text-gray-600 italic">
                点击编辑图标添加备注
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
