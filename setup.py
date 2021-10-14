from setuptools import setup, find_packages

with open("README.md", "r") as f:
    long_description = f.read()

setup(
    name='flowiz',
    version='2.4.0',
    author="George Gach",
    author_email="georgegach@outlook.com",
    description="Optical Flow file wizard",
    long_description=long_description,
    long_description_content_type="text/markdown",
    url="https://github.com/georgegach/flowiz",
    include_package_data=True,
    packages=find_packages(),
    install_requires=[
        'numpy',
        'tqdm',
        'matplotlib',
        'eel',
    ],
    classifiers=[
        "Programming Language :: Python :: 3",
        "License :: OSI Approved :: MIT License",
        "Operating System :: OS Independent",
    ],
)
