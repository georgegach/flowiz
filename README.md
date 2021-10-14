<p align="center">
<img src="https://raw.githubusercontent.com/georgegach/flowiz/master/demo/githubassets/flowiz-logo.png" width=400 alt='flowiz' style="margin:50px;max-width:400px">
<p>
    
<p align="center"><a href="https://www.codacy.com/app/georgegach/flowiz?utm_source=github.com&amp;utm_medium=referral&amp;utm_content=georgegach/flowiz&amp;utm_campaign=Badge_Grade"><img src="https://api.codacy.com/project/badge/Grade/676e7f10fc8a46c28ce69409a587828c" alt="Codacy Badge" /></a>
<a href="https://github.com/georgegach/flowiz/blob/master/LICENSE"><img src="https://img.shields.io/pypi/l/flowiz.svg" alt="PyPI - License" /></a>
<a href="https://pypi.org/project/flowiz/"><img src="https://img.shields.io/pypi/v/flowiz.svg" alt="PyPI" /></a>
<a href="https://pypistats.org/search/flowiz"><img src="https://img.shields.io/pypi/dm/flowiz.svg" alt="PyPI - Downloads" /></a>
    </p>
<p align="center">
<a href="https://mybinder.org/v2/gh/georgegach/flowiz/master?filepath=demo%2Ftest.ipynb"><img src="https://img.shields.io/static/v1.svg?label=launch&amp;message=notebook&amp;color=F37626&amp;style=for-the-badge&amp;logo=jupyter" alt="Launch Jupyter" /></a></p>
</p>

<h1></h1>

Converts Optical Flow `.flo` files to images `.png` and optionally compiles them to a video `.mp4` via ffmpeg

-   [Installation](#installation)
-   [Usage](#usage)
    -   [Command line usage](#command-line-usage)
    -   [Python usage](#python-usage)
    -   [GUI usage](#gui-usage)
    -   [Help](#help)
-   [Acknowledgements](#acknowledgements)
-   [FAQ](#faq)
-   [To-Do](#to-do)

## Installation
### PyPI

Easiest option to install `flowiz` is to grab the latest package from PyPI repo

```bash
pip install flowiz -U
```

### pip + Github
Alternatively you may install the package directly from github repo

```bash
pip install git+https://github.com/georgegach/flowiz/
```

### Build yourself
Or you can run `setup.py` to build it yourself locally

```bash
git clone https://github.com/georgegach/flowiz.git
cd flowiz
python setup.py install --user
```

Make sure you have requirements installed along with an `ffmpeg` to compile a video. `requirements.txt` contains latest working versions of this package. Feel free to use `pip-upgrader`. 
```bash
pip install -r requirements.txt
apt install ffmpeg 
# pacman -S ffmpeg
```

## Usage

Package can be used both from the command line and python script.

### Command line usage

The following script grabs `.flo` files from `./demo/flo/` directory and converts into `.png` saving in the same directory

```bash
python -m flowiz demo/flo/*.flo
```

You can pass output directory for `.png` images via `-o` or `--outdir` parameter

```bash
python -m flowiz demo/flo/*.flo --outdir demo/png/
```

You may compile converted `.png` images into a _24 fps_ `.mp4` clip by passing `-v` or `--videodir` parameter with a video output directory (without a filename)

```bash
python -m flowiz demo/flo/*.flo -o demo/png --videodir demo/mp4
```

Pass `-r` or `--framerate` parameter to control the framerate of compiled video

```bash
python -m flowiz demo/flo/*.flo -o demo/png -v demo/mp4 --framerate 2
```

### Python usage

Relevant python code is available in `demo/test.ipynb` notebook. Here's an excerpt:

```python
import flowiz as fz

files = glob.glob('demo/flo/*.flo')
img = fz.convert_from_file(files[0])
plt.imshow(img)
```

![Image](https://raw.githubusercontent.com/georgegach/flowiz/master/demo/png/frame_0001.flo.png)

In case you need to visualize `U V` channels separately from your numpy `floArray`:

```python
uv = fz.convert_from_flow(floArray, mode='UV')
axarr[0].imshow(uv[...,0], cmap=plt.get_cmap('binary'))
axarr[1].imshow(uv[...,1], cmap=plt.get_cmap('binary'))
```

![Image](https://raw.githubusercontent.com/georgegach/flowiz/master/demo/githubassets/uv_flows.png)

### GUI usage

Beta version of the `flowiz` graphical user interface is now accessible via `flowiz.gui` package. It is packaged using [ChrisKnott / Eel](https://github.com/ChrisKnott/Eel) and available via default web browser. To run the GUI simply type:

```bash
python -m flowiz.gui
```

Upon launching the web app, drag and drop or choose `.flo` file(s) using the `open file dialog`. Files will be converted using the python backend and placed in a temporary directory `flowiz/gui/web/guitemp`. Upon every session temporary directory will be emptied to avoid unnecessary polution.  

Mockup of the GUI is available at [georgegach.github.io/flowiz](http://georgegach.github.io/flowiz)

![Demo Video](https://raw.githubusercontent.com/georgegach/flowiz/master/demo/githubassets/flowiz.demo.gif)

### Help

```bash
$ python -m flowiz -h

usage: __main__.py [-h] [--outdir OUTDIR] [--videodir VIDEODIR]
                    [--framerate FRAMERATE]
                    input [input ...]

positional arguments:
  input                 Input file(s). (e.g.: __ ./demo/flo/*.flo)

optional arguments:
  -h, --help            show this help message and exit
  --outdir OUTDIR, -o OUTDIR
                        Output directory path. Default: same directory as
                        [.flo] files. (e.g.: __ -o ./demo/png/)
  --videodir VIDEODIR, -v VIDEODIR
                        Compiles [.mp4] video from [.png] images if parameter
                        is passed. Parameter requires video output directory
                        path without a filename. (e.g.: __ -v ./demo/mp4/)
  --framerate FRAMERATE, -r FRAMERATE
                        Frames per second of the video. (e.g.: __ -r 2)
```

## Acknowledgements

The library is based on Midlebury's Vision Project MATLAB code: <http://vision.middlebury.edu/flow/>
Original credits to Daniel Scharstein (C++) and Deqing Sun (MATLAB)

## FAQ

> Q: But what kind of name is `flowiz`?  
> A: The kind you choose when `flowkit`, `flowtools`, `flowlib`, `flowlab` are already taken.

> Q: Future work?  
> A: Some of the `To-Do` features are listed below with no determined timeline. If you'd like to contribute with the said features or something completely new, you may ![fork it](https://img.shields.io/github/forks/georgegach/flowiz.svg?label=fork%20it&style=social) and issue a pull request. 

## To-Do

-   [x] Ported from Matlab `flow_code`
-   [x] Project is available on PyPI 
-   [x] GUI
    -   [ ] Improve Front to Back-end throughput performance
