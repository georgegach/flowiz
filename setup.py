from setuptools import setup, find_packages

with open("README.md", "r") as f:
    long_description = f.read()

setup(
    name='flowiz',
    version='1.0.4',
    author="George Gach",
    author_email="george@gach.space",
    description="Optical Flow file wizard",
    long_description=long_description,
    long_description_content_type="text/markdown",
    url="https://github.com/georgegach/flowiz",
    packages=find_packages(),
    classifiers=[
        "Programming Language :: Python :: 3",
        "License :: OSI Approved :: MIT License",
        "Operating System :: OS Independent",
    ],
)
