#!/bin/sh
# 把 src/utils/*.js 复制成 .mjs（项目没有 "type":"module"，直接跑 .js 会报错）
cd "$(dirname "$0")"
for f in stats numtheory chincal splitbill taxcn bodysize worldclock; do
  if [ -f "../../../src/utils/$f.js" ]; then cp "../../../src/utils/$f.js" "./$f.mjs"; fi
done
for t in "$@"; do
  echo "--- $t"
  node "./$t"
done
