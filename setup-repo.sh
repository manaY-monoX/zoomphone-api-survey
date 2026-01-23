#!/bin/bash

# docs-init リポジトリセットアップスクリプト
# フリーザ様謹製

cd /Users/m-yamashita/Desktop/dev/x/docs-init || exit 1

echo "========================================="
echo "現在のディレクトリ:"
pwd
echo "========================================="

# .gitディレクトリが既に存在する場合は削除
if [ -d ".git" ]; then
    echo ".gitディレクトリが存在します。削除します..."
    rm -rf .git
fi

# 新規gitリポジトリとして初期化
echo "新規gitリポジトリを初期化します..."
git init

echo "========================================="
echo "全ファイルをステージングします..."
git add .

echo "========================================="
echo "初期コミットを作成します..."
git commit -m "$(cat <<'EOF'
INIT: Initial commit for docs-init repository

完璧なドキュメント管理システムの始まりですよ。

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>
EOF
)"

echo "========================================="
echo "リモートリポジトリを追加します..."
git remote add origin git@github.com:manaY-monoX/docs-init.git

echo "========================================="
echo "メインブランチを設定します..."
git branch -M main

echo "========================================="
echo "リモートにpushします..."
git push -u origin main

echo "========================================="
echo "完了しました！"
echo "========================================="
