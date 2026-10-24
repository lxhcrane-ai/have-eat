#!/bin/bash
# 把共享规则引擎复制到需要它的云函数目录（云函数是独立上传包，不能用 ../ 引用）
set -e
cd "$(dirname "$0")/.."
SRC=miniprogram/utils/rules.js
FU=miniprogram/utils/followup.js
KB=miniprogram/data/knowledge.js
REG=miniprogram/data/ruleRegistry.js

for fn in saveLog getFeed coachApi; do
  mkdir -p "cloudfunctions/$fn/lib"
  # 两处 require 路径要改：小程序端 ../data/ → 云函数端 ./lib/
  sed -e "s#require('../data/knowledge.js')#require('./knowledge.js')#" \
      -e "s#require('../data/ruleRegistry.js')#require('./ruleRegistry.js')#" \
      "$SRC" > "cloudfunctions/$fn/lib/rules.js"
  cp "$KB" "cloudfunctions/$fn/lib/knowledge.js"
  cp "$REG" "cloudfunctions/$fn/lib/ruleRegistry.js"
  sed -e "s#require('../data/ruleRegistry.js')#require('./ruleRegistry.js')#" "$FU" > "cloudfunctions/$fn/lib/followup.js"
  echo "synced -> cloudfunctions/$fn/lib/"
done
