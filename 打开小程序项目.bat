@echo off
chcp 936 >nul
title 拳王备赛营养教练 - 打开项目
echo 正在用微信开发者工具打开项目...
echo 目录: E:\AI\运动营养\boxer-coach
echo.
cd /d "E:\Program Files\微信web开发者工具"
call cli.bat open --project "E:\AI\运动营养\boxer-coach"
echo.
echo 如果窗口没有自动打开项目，请手动操作:
echo   1) 微信开发者工具已启动但需要扫码登录
echo   2) 登录后点 [导入项目]
echo   3) 目录选择: E:\AI\运动营养\boxer-coach
echo   4) AppID 选 [测试号] 或填自己的
echo.
pause
