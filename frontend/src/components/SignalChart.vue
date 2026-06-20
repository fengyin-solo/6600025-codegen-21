<script setup lang="ts">
import { computed, watch, ref, nextTick } from 'vue';
import VChart from 'vue-echarts';
import { use } from 'echarts/core';
import { CanvasRenderer } from 'echarts/renderers';
import { LineChart, ScatterChart } from 'echarts/charts';
import {
  GridComponent,
  TooltipComponent,
  LegendComponent,
  MarkLineComponent,
  GraphicComponent,
  DataZoomComponent
} from 'echarts/components';
import { useCanBusStore } from '../store/canbus';

use([CanvasRenderer, LineChart, ScatterChart, GridComponent, TooltipComponent, LegendComponent, MarkLineComponent, GraphicComponent, DataZoomComponent]);

const store = useCanBusStore();
const chartRef = ref<InstanceType<typeof VChart> | null>(null);

const chartOption = computed(() => {
  const signalEntries = Array.from(store.signals.entries());

  const colors = ['#06b6d4', '#22c55e', '#ef4444', '#eab308', '#a855f7'];
  const series = signalEntries.map(([name, sig], idx) => ({
    name,
    type: 'line' as const,
    smooth: true,
    symbol: 'none',
    lineStyle: { width: 2 },
    itemStyle: { color: colors[idx % colors.length] },
    data: sig.data.map(d => [d.time, d.value])
  }));

  const bookmarkMarkLineData = store.bookmarks.map(bm => ({
    xAxis: bm.timestamp,
    label: {
      show: true,
      formatter: '🔖',
      fontSize: 14,
      position: 'insideEndTop' as const,
      distance: 0
    },
    lineStyle: {
      color: bm.color,
      width: 2,
      type: 'dashed' as const
    },
    name: bm.note || '书签'
  }));

  const markLines = bookmarkMarkLineData.length > 0 || store.focusedTimestamp !== null ? [{
    silent: false,
    symbol: 'none',
    data: [
      ...bookmarkMarkLineData,
      ...(store.focusedTimestamp !== null ? [{
        xAxis: store.focusedTimestamp,
        label: {
          show: true,
          formatter: '▼',
          fontSize: 16,
          color: '#ffffff',
          position: 'insideEndTop' as const,
          distance: 0
        },
        lineStyle: {
          color: '#ffffff',
          width: 3,
          type: 'solid' as const
        }
      }] : [])
    ]
  }] : [];

  if (series.length > 0) {
    series[series.length - 1].markLine = markLines[0];
  }

  return {
    backgroundColor: '#111827',
    tooltip: {
      trigger: 'axis',
      backgroundColor: '#1f2937',
      borderColor: '#374151',
      textStyle: { color: '#e5e7eb', fontSize: 12 },
      formatter: (params: any) => {
        if (!Array.isArray(params) || params.length === 0) return '';
        const time = new Date(params[0].value[0]).toLocaleTimeString('zh-CN', { hour12: false });
        const bmAtTime = store.bookmarks.find(b => Math.abs(b.timestamp - params[0].value[0]) < 50);
        let html = `<div style="font-size:11px;color:#9ca3af">${time}</div>`;
        if (bmAtTime) {
          html += `<div style="font-size:11px;color:${bmAtTime.color};margin-top:2px">🔖 ${bmAtTime.note || '书签'}</div>`;
        }
        for (const p of params) {
          if (p.seriesType !== 'line') continue;
          html += `<div style="display:flex;align-items:center;gap:6px">
            <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${p.color}"></span>
            <span>${p.seriesName}: <b>${Number(p.value[1]).toFixed(1)}</b></span>
          </div>`;
        }
        return html;
      }
    },
    legend: {
      top: 8,
      textStyle: { color: '#9ca3af', fontSize: 11 },
      itemWidth: 12,
      itemHeight: 2
    },
    grid: {
      left: 60,
      right: 20,
      top: 45,
      bottom: 35
    },
    xAxis: {
      type: 'value',
      axisLabel: {
        color: '#6b7280',
        fontSize: 10,
        formatter: (val: number) => {
          const d = new Date(val);
          return d.toLocaleTimeString('zh-CN', { hour12: false });
        }
      },
      axisLine: { lineStyle: { color: '#374151' } },
      splitLine: { lineStyle: { color: '#1f2937' } }
    },
    yAxis: {
      type: 'value',
      axisLabel: { color: '#6b7280', fontSize: 10 },
      axisLine: { lineStyle: { color: '#374151' } },
      splitLine: { lineStyle: { color: '#1f2937' } }
    },
    series
  };
});

watch(() => store.focusedTimestamp, (ts) => {
  if (ts !== null && chartRef.value) {
    nextTick(() => {
      const chart = chartRef.value?.getEchartsInstance();
      if (chart) {
        const allTimes: number[] = [];
        store.signals.forEach(sig => {
          sig.data.forEach(d => allTimes.push(d.time));
        });
        if (allTimes.length > 0) {
          const minTime = Math.min(...allTimes);
          const maxTime = Math.max(...allTimes);
          const padding = (maxTime - minTime) * 0.15;
          chart.dispatchAction({
            type: 'dataZoom',
            startValue: Math.max(minTime, ts - padding),
            endValue: Math.min(maxTime, ts + padding)
          });
        }
      }
    });
  }
});
</script>

<template>
  <div class="flex flex-col h-full bg-gray-900 rounded-lg overflow-hidden relative">
    <div class="px-4 py-2 bg-gray-800 border-b border-gray-700 flex items-center justify-between">
      <h3 class="text-sm font-semibold text-gray-300">信号趋势图</h3>
      <span class="text-xs text-gray-500">
        {{ store.signals.size }} 个信号活跃 · {{ store.bookmarks.length }} 个书签
      </span>
    </div>
    <div class="flex-1 p-2 relative">
      <VChart
        ref="chartRef"
        :option="chartOption"
        autoresize
        class="w-full h-full"
        style="min-height: 200px;"
      />
    </div>
    <div v-if="store.signals.size === 0" class="absolute inset-0 flex items-center justify-center pointer-events-none pt-8">
      <p class="text-gray-600 text-sm">等待信号数据...</p>
    </div>
  </div>
</template>
