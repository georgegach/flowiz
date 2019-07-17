import argparse
import glob
import os
from flowiz import flowiz


parser = argparse.ArgumentParser()
parser.add_argument('input', nargs='+', help='Input file(s). (e.g.: __ ./demo/flo/*.flo)')
parser.add_argument('--outdir', '-o', action='store', help='Output directory path. Default: same directory as [.flo] files. (e.g.: __ -o ./demo/png/)')
parser.add_argument('--videodir', '-v', action='store', help='Compiles [.mp4] video from [.png] images if parameter is passed. Parameter requires video output directory path without a filename. (e.g.: __ -v ./demo/mp4/)')
parser.add_argument('--framerate', '-r', type=int, help='Frames per second of the video. (e.g.: __ -r 2)')

args = parser.parse_args()

if isinstance(args.input, list):
    flos = args.input
else:
    flos = glob.glob(args.inglob.split('\n')[0])

if args.outdir == None:
    args.outdir = os.path.dirname(flos[0])


print("> Rendering images [.png] from the flows [.flo]")
f = flowiz()
f.convertFiles(flos, outdir = args.outdir)


if args.videodir:
    print("> Compiling [.mp4] video from the flow images [.png]")
    if args.framerate == None:
        args.framerate = 24

    if not os.path.exists(args.videodir):
        os.mkdir(args.videodir)

    videofilename = os.path.join(args.videodir, os.path.basename(flos[0]) + '.mp4')
    pngpattern = os.path.join(args.outdir, '*.png')

    print("> Saving video as: " + videofilename)

    os.system("ffmpeg -r {} -loglevel panic -pattern_type glob -i '{}' {} ".format(
        args.framerate,
        pngpattern,
        videofilename
    ))