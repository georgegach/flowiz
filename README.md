# flow2image
Converts Optical Flow [.flo] files to images [.png] and optionally compiles them to a video [.mp4] via ffmpeg

## Usage
Convert [.flo] files from `tmp` directory to [.png] images and save into `tmp/flows` (with same filename + '.png').  
Appending `-v` and `-r 2` flags will enable you to generate 2 fps [.mp4] video from converted images.
```bash
python f2i.py tmp/*.flo -v -r 2 -o tmp/flows
```

General usage:

```bash
$ python f2i.py -h

usage: f2i.py [-h] [--outdir OUTDIR] [--video] [--framerate FRAMERATE]
              input [input ...]

positional arguments:
  input                 Input file(s)

optional arguments:
  -h, --help            show this help message and exit
  --outdir OUTDIR, -o OUTDIR
                        Output directory path. Default: same directory.
  --video, -v           Compile as video using ffmpeg.
  --framerate FRAMERATE, -r FRAMERATE
                        Frames per second of the video.
```
Relevant Jupyter Notebook is also available - `test.ipynb`.


# Requirements
```
numpy==1.14.3
tqdm==4.25.0
Pillow==5.2.0
```

![Image](https://github.com/georgegach/flow2image/raw/master/tmp/flows/frame_0001.flo.png)
