#!/bin/bash
# 把共享规则引擎复制到需要它的云函数目录（云函数是独立上传包，不能用 ../ 引用）
set -e
cd "$(dirname "$0")/.."
SRC=miniprogram/utils/rules.js
KB=miniprogram/data/knowledge.js

for fn in saveLog getFeed; do
  mkdir -p "cloudfunctions/$fn/lib"
  sed "s#require('../data/knowledge.js')#require('./knowledge.js')#" "$SRC" > "cloudfunctions/$fn/lib/rules.js"
  cp "$KB" "cloudfunctions/$fn/lib/knowledge.js"
  echo "synced -> cloudfunctions/$fn/lib/"
done
