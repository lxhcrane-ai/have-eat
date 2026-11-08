// 唯一需要你手工修改的配置文件。改完重新编译即可。
module.exports = {
  // 云开发环境 ID：云开发控制台 -> 设置 -> 环境ID
  env: 'YOUR-CLOUD-ENV-ID',

  // 旧邀请码：仅服务端兼容兜底，页面已不再展示或预填。
  // 新流程由教练在教练看板生成一次性配对码（pair_codes 集合），拳王输入后绑定。
  coachCode: 'COACH-8888',

  // 订阅消息模板 ID 已统一放到云函数环境变量，前端不再保存：
  //   TPL_COACH_LOG / TPL_ATHLETE_MSG / TPL_ADVICE_PUBLISH / TPL_ADVICE_CHANGE
  // 未配置时订阅流程静默跳过，站内红点与收件箱仍然可用。

  // 照片识别热量：API key 不放小程序里（会被反编译），已改到云函数 visionFood 的环境变量：
  //   VISION_BASE_URL / VISION_MODEL / VISION_API_KEY
  // 下面两个字段仅保留兼容，留空即可；填了也不会被读取。
  visionApi: '',
  visionKey: '',

  // 教练称呼，用于文案
  coachName: '教练',
  athleteName: '拳王'
};
