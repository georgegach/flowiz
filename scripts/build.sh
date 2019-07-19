#!/bin/bash
pip uninstall flowiz -y
python setup.py sdist bdist_wheel
pip install --find-links=dist flowiz --no-index
rm -rf dist build flowiz.egg-info 
