import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Bell, Send, Save, CheckCircle2, AlertCircle, Loader2, Eye, EyeOff } from 'lucide-react';
import {
  getWebhookSettings,
  saveWebhookSettings,
  testWebhookSettings,
  WebhookConfig,
  DEFAULT_WEBHOOK_CONFIG,
} from '../services/webhookService';

export function SettingsWebhookSection() {
  const { t } = useTranslation();
  const [config, setConfig] = useState<WebhookConfig>(DEFAULT_WEBHOOK_CONFIG);
  const [loading, setLoading] = useState<boolean>(true);
  const [testing, setTesting] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);
  const [showSecret, setShowSecret] = useState<boolean>(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<boolean>(false);

  useEffect(() => {
    let mounted = true;
    getWebhookSettings()
      .then((cfg) => {
        if (mounted) {
          setConfig(cfg || DEFAULT_WEBHOOK_CONFIG);
          setLoading(false);
        }
      })
      .catch(() => {
        if (mounted) {
          setConfig(DEFAULT_WEBHOOK_CONFIG);
          setLoading(false);
        }
      });
    return () => {
      mounted = false;
    };
  }, []);

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const msg = await testWebhookSettings(config);
      setTestResult({ success: true, message: msg || '通知发送成功！请检查您的接收客户端。' });
    } catch (err) {
      setTestResult({
        success: false,
        message: typeof err === 'string' ? err : '发送失败，请检查 URL 与网络连接',
      });
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveSuccess(false);
    try {
      await saveWebhookSettings(config);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      console.error('保存 Webhook 配置失败:', err);
    } finally {
      setSaving(false);
    }
  };

  const getUrlPlaceholder = () => {
    switch (config.channel) {
      case 'feishu':
        return 'https://open.feishu.cn/open-apis/bot/v2/hook/xxxxxx';
      case 'dingtalk':
        return 'https://oapi.dingtalk.com/robot/send?access_token=xxxxxx';
      case 'wecom':
        return 'https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=xxxxxx';
      case 'serverchan':
        return 'https://sctapi.ftqq.com/SCTxxxxxx.send';
      case 'telegram':
        return 'https://api.telegram.org/bot123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11/sendMessage';
      case 'pushdeer':
        return 'https://api2.pushdeer.com/message/push?pushkey=xxxxxx';
      case 'bark':
        return 'https://api.day.app/your_bark_key';
      default:
        return 'https://your-custom-webhook.com/api/notify';
    }
  };

  if (loading) {
    return null;
  }

  const currentConfig = config || DEFAULT_WEBHOOK_CONFIG;

  return (
    <>
      <div className="group-title" style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '24px' }}>
        <Bell size={18} />
        <span>{t('settings.webhook.title', '签到结果通知推送 (Webhook)')}</span>
      </div>

      <div className="settings-group">
        {/* 开关 */}
        <div className="settings-row">
          <div className="row-label">
            <div className="row-title">{t('settings.webhook.enable', '启用自动签到通知')}</div>
            <div className="row-desc">
              {t(
                'settings.webhook.enableDesc',
                '每日错峰自动打卡（CodeBuddy / Trae）完成后，自动推送结构化汇报到指定群聊或手机',
              )}
            </div>
          </div>
          <div className="row-control">
            <label className="switch">
              <input
                type="checkbox"
                checked={currentConfig.enabled}
                onChange={(e) => setConfig({ ...currentConfig, enabled: e.target.checked })}
              />
              <span className="slider"></span>
            </label>
          </div>
        </div>

        {currentConfig.enabled && (
          <div style={{ animation: 'fadeUp 0.3s ease both' }}>
            {/* 渠道选择 */}
            <div className="settings-row">
              <div className="row-label">
                <div className="row-title">{t('settings.webhook.channel', '通知渠道')}</div>
                <div className="row-desc">{t('settings.webhook.channelDesc', '选择接收打卡通知的平台')}</div>
              </div>
              <div className="row-control">
                <select
                  className="settings-select"
                  value={config.channel}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      channel: e.target.value as WebhookConfig['channel'],
                    })
                  }
                  style={{
                    padding: '8px 12px',
                    borderRadius: '6px',
                    border: '1px solid var(--border-color, #333)',
                    background: 'var(--bg-secondary, #222)',
                    color: 'inherit',
                  }}
                >
                  <option value="feishu">飞书自定义机器人 (Feishu)</option>
                  <option value="dingtalk">钉钉自定义机器人 (DingTalk)</option>
                  <option value="wecom">企业微信群机器人 (WeCom)</option>
                  <option value="serverchan">Server酱 (Turbo / SCT)</option>
                  <option value="telegram">Telegram Bot</option>
                  <option value="pushdeer">PushDeer</option>
                  <option value="bark">Bark (iOS 推送)</option>
                  <option value="custom">自定义 Webhook (POST)</option>
                </select>
              </div>
            </div>

            {/* Webhook URL */}
            <div className="settings-row">
              <div className="row-label">
                <div className="row-title">{t('settings.webhook.url', 'Webhook URL / API 地址')}</div>
                <div className="row-desc">{t('settings.webhook.urlDesc', '机器人完整 Webhook 回调地址或推送 Key')}</div>
              </div>
              <div className="row-control" style={{ flex: 1, maxWidth: '480px' }}>
                <input
                  type="text"
                  className="settings-input"
                  style={{ width: '100%' }}
                  value={config.webhookUrl}
                  onChange={(e) => setConfig({ ...config, webhookUrl: e.target.value })}
                  placeholder={getUrlPlaceholder()}
                />
              </div>
            </div>

            {/* 安全设置: 加签密钥 (Secret) - 针对钉钉、飞书及自定义 Webhook */}
            {(config.channel === 'dingtalk' || config.channel === 'feishu' || config.channel === 'custom') && (
              <div className="settings-row">
                <div className="row-label">
                  <div className="row-title">
                    {config.channel === 'dingtalk'
                      ? t('settings.webhook.dingtalkSecret', '安全设置加签密钥 (Secret)')
                      : config.channel === 'feishu'
                      ? t('settings.webhook.feishuSecret', '安全校验签名密钥 (Secret)')
                      : t('settings.webhook.customSecret', '鉴权密钥 / Token (Secret)')}
                  </div>
                  <div className="row-desc">
                    {config.channel === 'dingtalk'
                      ? '钉钉自定义机器人安全设置若勾选了「加签」，请在此填写以 SEC 开头的密钥'
                      : config.channel === 'feishu'
                      ? '飞书自定义机器人安全设置若勾选了「签名校验」，请在此填写签名密钥'
                      : '可选，将作为 X-Webhook-Secret 自定义请求头随 POST 请求发送'}
                  </div>
                </div>
                <div className="row-control" style={{ flex: 1, maxWidth: '480px', position: 'relative' }}>
                  <input
                    type={showSecret ? 'text' : 'password'}
                    className="settings-input"
                    style={{ width: '100%', paddingRight: '36px' }}
                    value={config.secret || ''}
                    onChange={(e) => setConfig({ ...config, secret: e.target.value })}
                    placeholder={
                      config.channel === 'dingtalk'
                        ? '例如: SEC6f9bd42bd52cfdad14e7d122b99852c1572a4f6e45f1678d3829c8f4fd3dfb26'
                        : config.channel === 'feishu'
                        ? '例如: 密钥字符串'
                        : '可选填写自定义密钥'
                    }
                  />
                  <button
                    type="button"
                    onClick={() => setShowSecret(!showSecret)}
                    title={showSecret ? '隐藏密钥' : '显示密钥'}
                    style={{
                      position: 'absolute',
                      right: '8px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      color: 'var(--text-secondary, #888)',
                      display: 'flex',
                      alignItems: 'center',
                      padding: '4px',
                    }}
                  >
                    {showSecret ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>
            )}

            {/* Telegram 专属 Chat ID */}
            {config.channel === 'telegram' && (
              <div className="settings-row">
                <div className="row-label">
                  <div className="row-title">Telegram Chat ID</div>
                  <div className="row-desc">接收消息的个人 Chat ID 或群组 ID（如 @username 或 -100xxxxxxx）</div>
                </div>
                <div className="row-control" style={{ flex: 1, maxWidth: '480px' }}>
                  <input
                    type="text"
                    className="settings-input"
                    style={{ width: '100%' }}
                    value={config.telegramChatId || ''}
                    onChange={(e) => setConfig({ ...config, telegramChatId: e.target.value })}
                    placeholder="例如: 123456789"
                  />
                </div>
              </div>
            )}

            {/* 操作条 */}
            <div
              className="settings-row"
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                paddingTop: '12px',
                paddingBottom: '12px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {testResult && (
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      fontSize: '13px',
                      color: testResult.success ? '#10b981' : '#ef4444',
                    }}
                  >
                    {testResult.success ? <CheckCircle2 size={15} /> : <AlertCircle size={15} />}
                    {testResult.message}
                  </span>
                )}
                {saveSuccess && (
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      fontSize: '13px',
                      color: '#10b981',
                    }}
                  >
                    <CheckCircle2 size={15} />
                    配置保存成功！
                  </span>
                )}
              </div>

              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={handleTest}
                  disabled={testing || !config.webhookUrl.trim()}
                  style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                  {testing ? <Loader2 size={14} className="spin" /> : <Send size={14} />}
                  <span>{testing ? '正在测试...' : '发送测试通知'}</span>
                </button>

                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={handleSave}
                  disabled={saving}
                  style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                  {saving ? <Loader2 size={14} className="spin" /> : <Save size={14} />}
                  <span>{saving ? '保存中...' : '保存通知设置'}</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
