// 唯一需要你手工修改的配置文件。改完重新编译即可。
module.exports = {
  // 云开发环境 ID：云开发控制台 -> 设置 -> 环境ID
  env: 'YOUR-CLOUD-ENV-ID',

  // 拳王 openid。首次用拳王微信打开小程序 -> 我的 -> 复制 openid 填到这里，
  // 或让拳王在「绑定教练」页输入下方 coachCode，自动建立绑定关系。
  coachCode: 'COACH-8888',

  // 订阅消息模板 ID（可选）。没有就留空，教练端改用小程序内红点 + 收件箱。
  tplCoachLog: '',
  tplCoachMessage: '',

  // 拍照识别热量（可选）。留空则走本地食物库估算，不影响使用。
  visionApi: '',
  visionKey: '',

  // 教练称呼，用于文案
  coachName: '教练',
  athleteName: '拳王'
};
