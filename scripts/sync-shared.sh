#!/bin/bash
# 把共享规则引擎复制到需要它的云函数目录（云函数是独立上传包，不能用 ../ 引用）
set -e
cd "$(dirname "$0")/.."
SRC=miniprogram/utils/rules.js
GOALS_SRC=miniprogram/utils/goals.js
GM=miniprogram/data/goalMatrix.js
FU=miniprogram/utils/followup.js
KB=miniprogram/data/knowledge.js
REG=miniprogram/data/ruleRegistry.js
SUB=miniprogram/utils/submsg.js
WK=miniprogram/utils/weekly.js

# 订阅消息共享库：四个通知场景 + 授权落库
for fn in saveLog chat advice bind whoami; do
  mkdir -p "cloudfunctions/$fn/lib"
  cp "$SUB" "cloudfunctions/$fn/lib/submsg.js"
  echo "synced -> cloudfunctions/$fn/lib/submsg.js"
done

for fn in saveLog getFeed coachApi advice; do
  mkdir -p "cloudfunctions/$fn/lib"
  # 两处 require 路径要改：小程序端 ../data/ → 云函数端 ./lib/
  sed -e "s#require('../data/knowledge.js')#require('./knowledge.js')#" \
      -e "s#require('../data/ruleRegistry.js')#require('./ruleRegistry.js')#" \
      -e "s#require('../data/goalMatrix.js')#require('./goalMatrix.js')#" \
      "$SRC" > "cloudfunctions/$fn/lib/rules.js"
  cp "$KB" "cloudfunctions/$fn/lib/knowledge.js"
  cp "$REG" "cloudfunctions/$fn/lib/ruleRegistry.js"
  cp "$GM" "cloudfunctions/$fn/lib/goalMatrix.js"
  sed -e "s#require('../data/goalMatrix.js')#require('./goalMatrix.js')#" \
      "$GOALS_SRC" > "cloudfunctions/$fn/lib/goals.js"
  # getFeed / advice 需要 refeed 派生（ctx.refeed），同步 weekly.js
  if [ "$fn" = "getFeed" ] || [ "$fn" = "advice" ]; then
    cp "$WK" "cloudfunctions/$fn/lib/weekly.js"
  fi
  # advice 的审阅链路不需要 followup，只同步规则引擎三件套
  if [ "$fn" != "advice" ]; then
    sed -e "s#require('../data/ruleRegistry.js')#require('./ruleRegistry.js')#" "$FU" > "cloudfunctions/$fn/lib/followup.js"
  fi
  echo "synced -> cloudfunctions/$fn/lib/"
done

# visionFood 只需要照片识别的解析层，不需要规则引擎
mkdir -p cloudfunctions/visionFood/lib
cp miniprogram/utils/vision.js cloudfunctions/visionFood/lib/vision.js
echo "synced -> cloudfunctions/visionFood/lib/"
