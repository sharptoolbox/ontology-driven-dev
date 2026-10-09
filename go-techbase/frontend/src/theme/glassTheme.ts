// 视觉体系移植自 gopherforge (https://github.com/SuperiorChuo/gopherforge) MIT License,适配 OPIC 技术底座。
// 管理控制台双主题 antd ThemeConfig(深空暗色 / 白蓝亮色)。
// 作用域隔离:两份配置只交给 /admin 子树内的 <ConfigProvider>,不带全局 cssVar,
// 用户工作台沿用外层默认亮色主题,token 不会跨主题泄漏。
import { theme as antdTheme, type ThemeConfig } from 'antd'

// 深空暗色(默认)
export const glassDarkTheme: ThemeConfig = {
  hashed: false,
  algorithm: antdTheme.darkAlgorithm,
  token: {
    colorPrimary: '#6366f1',
    colorInfo: '#6366f1',
    colorSuccess: '#34d399',
    colorWarning: '#fbbf24',
    colorError: '#f87171',
    borderRadius: 8,
    fontSize: 14,
    // 深空底色体系:页面底 < 容器 < 悬浮层,层级靠亮度区分
    colorBgLayout: '#0a0b14',
    colorBgContainer: 'rgba(18, 20, 34, 0.6)',
    // 悬浮层必须半透明,否则 CSS 侧的 backdrop-filter 无从生效(玻璃变塑料板)
    colorBgElevated: 'rgba(24, 26, 46, 0.85)',
    colorBorder: 'rgba(148, 163, 184, 0.22)',
    colorBorderSecondary: 'rgba(148, 163, 184, 0.12)',
    colorText: 'rgba(226, 232, 240, 0.88)',
    colorTextSecondary: 'rgba(148, 163, 184, 0.85)',
    colorTextTertiary: 'rgba(148, 163, 184, 0.6)',
    colorTextQuaternary: 'rgba(148, 163, 184, 0.4)',
    boxShadowSecondary: '0 10px 34px rgba(0, 0, 0, 0.45)',
  },
  components: {
    Card: {
      borderRadiusLG: 14,
      paddingLG: 20,
      colorBgContainer: 'rgba(18, 20, 34, 0.6)',
      colorBorderSecondary: 'rgba(148, 163, 184, 0.12)',
    },
    Layout: {
      headerBg: 'transparent',
      bodyBg: '#0a0b14',
      siderBg: 'transparent',
    },
    Menu: {
      darkItemBg: 'transparent',
      darkSubMenuItemBg: 'transparent',
      darkItemSelectedBg: 'rgba(99, 102, 241, 0.85)',
      darkItemHoverBg: 'rgba(255, 255, 255, 0.07)',
      itemBorderRadius: 8,
      itemMarginInline: 8,
    },
    Table: {
      headerBg: 'rgba(255, 255, 255, 0.03)',
      headerColor: 'rgba(203, 213, 225, 0.8)',
      rowHoverBg: 'rgba(99, 102, 241, 0.07)',
      borderColor: 'rgba(148, 163, 184, 0.1)',
      colorBgContainer: 'transparent',
    },
    Modal: {
      contentBg: 'rgba(21, 23, 41, 0.82)',
      headerBg: 'transparent',
    },
    Button: {
      controlHeight: 34,
      primaryShadow: '0 4px 14px rgba(99, 102, 241, 0.35)',
    },
    Tooltip: {
      colorBgSpotlight: 'rgba(30, 33, 56, 0.9)',
    },
  },
}

// 白蓝液态玻璃(亮色)
export const glassLightTheme: ThemeConfig = {
  hashed: false,
  algorithm: antdTheme.defaultAlgorithm,
  token: {
    colorPrimary: '#2563eb',
    colorInfo: '#2563eb',
    colorSuccess: '#059669',
    colorWarning: '#d97706',
    colorError: '#dc2626',
    borderRadius: 8,
    fontSize: 14,
    colorBgLayout: '#edf3fb',
    // 半透明白容器 + CSS 侧 backdrop-filter,构成液态玻璃
    colorBgContainer: 'rgba(255, 255, 255, 0.72)',
    colorBgElevated: '#ffffff',
    colorBorder: 'rgba(15, 23, 42, 0.15)',
    colorBorderSecondary: 'rgba(15, 23, 42, 0.06)',
    colorText: 'rgba(15, 23, 42, 0.88)',
    colorTextSecondary: 'rgba(71, 85, 105, 0.9)',
    colorTextTertiary: 'rgba(100, 116, 139, 0.75)',
    colorTextQuaternary: 'rgba(148, 163, 184, 0.6)',
    boxShadowSecondary: '0 10px 34px rgba(37, 99, 235, 0.1)',
  },
  components: {
    Card: {
      borderRadiusLG: 14,
      paddingLG: 20,
      colorBgContainer: 'rgba(255, 255, 255, 0.72)',
      colorBorderSecondary: 'rgba(15, 23, 42, 0.06)',
    },
    Layout: {
      headerBg: 'transparent',
      bodyBg: '#edf3fb',
      siderBg: 'transparent',
    },
    Menu: {
      itemBg: 'transparent',
      subMenuItemBg: 'transparent',
      itemSelectedBg: 'rgba(37, 99, 235, 0.1)',
      itemSelectedColor: '#2563eb',
      itemHoverBg: 'rgba(37, 99, 235, 0.06)',
      itemBorderRadius: 8,
      itemMarginInline: 8,
    },
    Table: {
      headerBg: 'rgba(37, 99, 235, 0.04)',
      headerColor: '#475569',
      rowHoverBg: 'rgba(37, 99, 235, 0.045)',
      borderColor: 'rgba(15, 23, 42, 0.06)',
      colorBgContainer: 'transparent',
    },
    Button: {
      controlHeight: 34,
      primaryShadow: '0 4px 14px rgba(37, 99, 235, 0.3)',
    },
  },
}
