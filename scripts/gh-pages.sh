#!/bin/bash
directory=_site
web=flowiz/gui/web/*
main=master
gh=gh-pages
build_command() {
  cp -r $web $directory
}

echo -e "\033[0;32mDeleting existing $gh branch\033[0m"
git push origin --delete $gh
git branch -D $gh

echo -e "\033[0;32mSetting up new $gh branch\033[0m"
git checkout --orphan $gh
git reset --hard
git commit --allow-empty -m "Init"
git checkout $main


echo -e "\033[0;32mDeleting old content...\033[0m"
rm -rf $directory

echo -e "\033[0;32mChecking out $gh....\033[0m"
git worktree add $directory $gh

echo -e "\033[0;32mGenerating site...\033[0m"
build_command

echo -e "\033[0;32mDeploying $gh branch...\033[0m"
cd $directory &&
  git add --all &&
  git commit -m "Deploy updates" &&
  git push origin $gh

echo -e "\033[0;32mCleaning up...\033[0m"
git worktree remove $directory
