# flowiz
Converts Optical Flow [.flo] files to images [.png] and optionally compiles them to a video [.mp4] via ffmpeg


# Installation
Grab the latest package from PyPI repo
```bash
pip install flowiz -U
```

or grab it straight from Github
```bash
pip install git+https://github.com/georgegach/flowiz/
```

or clone the repo and install using `setup.py`
```bash
git clone https://github.com/georgegach/flowiz.git
cd flowiz
python setup.py install --user
```

# Usage
Package can be used both from the command line and python script. 

## Command line usage
The following script grabs `.flo` files from `./demo/flo/` directory and converts into `.png` saving in the same directory

```bash
python -m flowiz demo/flo/*.flo 
```

You can pass output directory for `.png` images via `-o` or `--outdir` parameter
```bash
python -m flowiz demo/flo/*.flo --outdir demo/png/
```

You may compile converted `.png` images into a *24 fps* `.mp4` clip by passing `-v` or `--videodir` parameter with a video output directory (without a filename)
```
python -m flowiz demo/flo/*.flo -o demo/png --videodir demo/mp4
```

Pass `-r` or `--framerate` parameter to control the framerate of compiled video
```bash
python -m flowiz demo/flo/*.flo -o demo/png -v demo/mp4 --framerate 2
```


## Python usage

Relevant python code is available in `demo/test.ipynb` notebook. Here's an excerpt:
```python
from flowiz import flowiz

f = flowiz()
files = glob.glob('demo/flo/*.flo')
img = f.convertFromFile(files[0])
plt.imshow(img)
```
![Image](https://github.com/georgegach/flowiz/raw/master/demo/png/frame_0001.flo.png)

In case you need to visualize `U V` channels separately from your numpy `floArray`:
```
...
uv = f.convertFromFlow(floArray, mode='UV')
...
axarr[0].imshow(uv[...,0], cmap=plt.get_cmap('binary'))
axarr[1].imshow(uv[...,1], cmap=plt.get_cmap('binary'))
```
![Image](https://github.com/georgegach/flowiz/raw/master/demo/_github_assets_/uv_flow.png)

## Help
```bash
python -m flowiz -h
```
```
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


# Requirements
Make sure you have following packages installed
```bash
pip install numpy tqdm pillow
```



# Acknowledgements
The library is based on Midlebury's Vision Project MATLAB code: http://vision.middlebury.edu/flow/   
Original credits to Daniel Scharstein (C++) and Deqing Sun (MATLAB)

# FAQ
> Q: What kind of name is `flowiz`  
> A: The kind you choose when `flowkit`, `flowtools`, `flowlib` is already taken. 

# To-Do
- [x] Ported
- [x] Version 1.0 + pip
- [ ] Standalone PNG packaging (remove `pillow` dependency)
- [ ] Standalone MP4 compiler (remove `ffmpeg` dependency)
