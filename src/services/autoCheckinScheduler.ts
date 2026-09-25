/**
 * 全局自动签到调度器 (Auto Check-in Scheduler)
 *
 * 负责在应用生命周期内常驻运行，定时巡检 Trae、WorkBuddy / CodeBuddy CN 等各平台的签到计划。
 * 特性：
 * 1. 周期性（每 60 秒）自动评估时间窗口与随机打散调度；
 * 2. 监听系统唤醒（visibilitychange）与配置变更事件，实时自适应触发；
 * 3. 并发安全锁，避免重复执行；
 * 4. 签到成功后自动触发 Webhook 通知与 UI 状态同步。
 */

import {
  runTraeAutoCheckinCycleIfNeeded,
  getTraeAutoCheckinConfig,
  TRAE_AUTO_CHECKIN_CONFIG_CHANGED_EVENT,
} from './traeAutoCheckinService';
import {
  runWorkbuddyAutoCheckinCycleIfNeeded,
  getWorkbuddyAutoCheckinConfig,
  WORKBUDDY_AUTO_CHECKIN_CONFIG_CHANGED_EVENT,
} from './workbuddyAutoCheckinService';
import {
  runQoderAutoCheckinCycleIfNeeded,
  getQoderAutoCheckinConfig,
  QODER_AUTO_CHECKIN_CONFIG_CHANGED_EVENT,
} from './qoderAutoCheckinService';

let schedulerIntervalId: ReturnType<typeof setInterval> | null = null;
let isCycleExecuting = false;
let isSchedulerStarted = false;

/**
 * 触发一次完整的各平台自动签到检查
 */
export async function runGlobalAutoCheckinCycle(force = false): Promise<void> {
  if (isCycleExecuting) {
    return;
  }
  isCycleExecuting = true;

  try {
    const traeConfig = getTraeAutoCheckinConfig();
    const wbConfig = getWorkbuddyAutoCheckinConfig();
    const qoderConfig = getQoderAutoCheckinConfig();

    // 1. Trae 自动签到
    if (traeConfig.enabled || force) {
      try {
        const traeResult = await runTraeAutoCheckinCycleIfNeeded(force);
        if (traeResult === 'completed') {
          console.log('[AutoCheckinScheduler] Trae 签到检查周期完成');
        }
      } catch (err) {
        console.warn('[AutoCheckinScheduler] Trae 自动签到执行异常:', err);
      }
    }

    // 2. WorkBuddy / CodeBuddy CN 自动签到
    if (wbConfig.enabled || force) {
      try {
        const wbResult = await runWorkbuddyAutoCheckinCycleIfNeeded(force);
        if (wbResult === 'completed') {
          console.log('[AutoCheckinScheduler] WorkBuddy / CodeBuddy CN 签到检查周期完成');
        }
      } catch (err) {
        console.warn('[AutoCheckinScheduler] WorkBuddy 自动签到执行异常:', err);
      }
    }

    // 3. Qoder (国际版 / 国内版 / 千问办公) 自动签到
    if (qoderConfig.enabled || force) {
      try {
        const qoderResult = await runQoderAutoCheckinCycleIfNeeded(force);
        if (qoderResult === 'completed') {
          console.log('[AutoCheckinScheduler] Qoder / 千问办公 签到检查周期完成');
        }
      } catch (err) {
        console.warn('[AutoCheckinScheduler] Qoder 自动签到执行异常:', err);
      }
    }
  } finally {
    isCycleExecuting = false;
  }
}

/**
 * 启动全局自动签到后台定时器
 */
export function startAutoCheckinScheduler(): () => void {
  if (isSchedulerStarted) {
    return stopAutoCheckinScheduler;
  }
  isSchedulerStarted = true;

  console.log('[AutoCheckinScheduler] 全局自动签到调度器已启动（轮询间隔: 60s）');

  // 启动即刻进行一次初始检查
  void runGlobalAutoCheckinCycle(false);

  // 每 60 秒轮询巡检一次
  schedulerIntervalId = setInterval(() => {
    void runGlobalAutoCheckinCycle(false);
  }, 60 * 1000);

  // 监听配置变更，即时触发重新计算
  const handleConfigChanged = () => {
    console.log('[AutoCheckinScheduler] 检测到签到配置变更，立即重新评估调度...');
    void runGlobalAutoCheckinCycle(false);
  };

  // 监听窗口重新变为可见（例如系统睡眠唤醒）
  const handleVisibilityChange = () => {
    if (document.visibilityState === 'visible') {
      console.log('[AutoCheckinScheduler] 应用重新恢复可见，立即执行签到巡检...');
      void runGlobalAutoCheckinCycle(false);
    }
  };

  window.addEventListener(TRAE_AUTO_CHECKIN_CONFIG_CHANGED_EVENT, handleConfigChanged);
  window.addEventListener(WORKBUDDY_AUTO_CHECKIN_CONFIG_CHANGED_EVENT, handleConfigChanged);
  window.addEventListener(QODER_AUTO_CHECKIN_CONFIG_CHANGED_EVENT, handleConfigChanged);
  document.addEventListener('visibilitychange', handleVisibilityChange);

  return () => {
    stopAutoCheckinScheduler();
    window.removeEventListener(TRAE_AUTO_CHECKIN_CONFIG_CHANGED_EVENT, handleConfigChanged);
    window.removeEventListener(WORKBUDDY_AUTO_CHECKIN_CONFIG_CHANGED_EVENT, handleConfigChanged);
    window.removeEventListener(QODER_AUTO_CHECKIN_CONFIG_CHANGED_EVENT, handleConfigChanged);
    document.removeEventListener('visibilitychange', handleVisibilityChange);
  };
}

/**
 * 停止全局自动签到调度器
 */
export function stopAutoCheckinScheduler(): void {
  if (schedulerIntervalId !== null) {
    clearInterval(schedulerIntervalId);
    schedulerIntervalId = null;
  }
  isSchedulerStarted = false;
  console.log('[AutoCheckinScheduler] 全局自动签到调度器已停止');
}
