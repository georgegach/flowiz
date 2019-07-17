# Converts Flow .flo files to Images

# Author : George Gach (@georgegach)
# Date   : July 2019

# Adapted from the Middlebury Vision project's Flow-Code
# URL    : http://vision.middlebury.edu/flow/

import numpy as np
import os
import errno
from tqdm import tqdm
from PIL import Image


class flowiz(object):

    def __init__(self, debug=False):
        self.flow = None
        self.path = None
        self.TAG_FLOAT = 202021.25
        self.flags = {}
        self.flags['d'] = debug

    def _readFlow(self, path):

        if not isinstance(path, str):
            raise AssertionError("Input [{p}] is not a string".format(p=path))
        if not os.path.isfile(path):
            raise AssertionError("Path [{p}] does not exist".format(p=path))
        if not path.split('.')[-1] == 'flo':
            raise AssertionError("File extension [flo] required, [{f}] given".format(f=path.split('.')[-1]))

        flo = open(path, 'rb')

        tag = np.fromfile(flo, np.float32, count=1)[0]
        if not self.TAG_FLOAT == tag:
            raise AssertionError("Wrong Tag [{t}]".format(t=tag))

        width = np.fromfile(flo, np.int32, count=1)[0]
        if not width > 0 and width < 100000:
            raise AssertionError("Illegal width [{w}]".format(w=width))

        height = np.fromfile(flo, np.int32, count=1)[0]
        if not width > 0 and width < 100000:
            raise AssertionError("Illegal height [{h}]".format(h=height))

        nbands = 2
        tmp = np.fromfile(flo, np.float32, count= nbands * width * height)
        flow = np.resize(tmp, (int(height), int(width), int(nbands)))
        flo.close()

        self.flow = flow
        self.path = path
        return flow

    def _colorWheel(self):
        # Original inspiration: http://members.shaw.ca/quadibloc/other/colint.htm

        RY = 15
        YG = 6
        GC = 4
        CB = 11
        BM = 13
        MR = 6

        ncols = RY + YG + GC + CB + BM + MR

        colorwheel = np.zeros([ncols, 3]) # RGB

        col = 0

        #RY
        colorwheel[0:RY, 0] = 255
        colorwheel[0:RY, 1] = np.floor(255*np.arange(0, RY, 1)/RY)
        col += RY

        #YG
        colorwheel[col : YG + col, 0] = 255 - np.floor(255*np.arange(0, YG, 1)/YG)
        colorwheel[col : YG + col, 1] = 255
        col += YG

        #GC
        colorwheel[col : GC + col, 1] = 255
        colorwheel[col : GC + col, 2] = np.floor(255*np.arange(0, GC, 1)/GC)
        col += GC

        #CB
        colorwheel[col : CB + col, 1] = 255 - np.floor(255*np.arange(0, CB, 1)/CB)
        colorwheel[col : CB + col, 2] = 255
        col += CB

        #BM
        colorwheel[col : BM + col, 2] = 255
        colorwheel[col : BM + col, 0] = np.floor(255*np.arange(0, BM, 1)/BM)
        col += BM

        #MR
        colorwheel[col : MR + col, 2] = 255 - np.floor(255*np.arange(0, MR, 1)/MR)
        colorwheel[col : MR + col, 0] = 255

        return colorwheel
    
    def _computeColor(self, u, v):
        colorwheel = self._colorWheel()
        idxNans = np.where(np.logical_or(
            np.isnan(u),
            np.isnan(v)
        ))
        u[idxNans] = 0
        v[idxNans] = 0

        ncols = colorwheel.shape[0]
        radius = np.sqrt(np.multiply(u, u) + np.multiply(v, v))
        a = np.arctan2(-v, -u) / np.pi
        fk = (a+1) / 2 * (ncols - 1)
        k0 = fk.astype(np.uint8)
        k1 = k0 + 1
        k1[k1 == ncols] = 0
        f = fk - k0

        img = np.empty([k1.shape[0], k1.shape[1], 3])
        ncolors = colorwheel.shape[1]

        for i in range(ncolors):
            tmp = colorwheel[:, i]
            col0 = tmp[k0] / 255
            col1 = tmp[k1] / 255
            col = (1-f) * col0 + f * col1
            idx = radius <= 1
            col[idx] = 1 - radius[idx] * (1 - col[idx])
            col[~idx] *= 0.75
            img[:, :, i] = np.floor(255 * col).astype(np.uint8) # RGB
            # img[:, :, 2 - i] = np.floor(255 * col).astype(np.uint8) # BGR


        return img.astype(np.uint8)

    def _normalizeFlow(self, flow):
        UNKNOWN_FLOW_THRESH = 1e9
        # UNKNOWN_FLOW = 1e10

        height, width, nBands = flow.shape
        if not nBands == 2:
            raise AssertionError("Image must have two bands. [{h},{w},{nb}] shape given instead".format(h=height, w=width, nb=nBands))

        u = flow[:, :, 0]
        v = flow[:, :, 1]

        # Fix unknown flow
        idxUnknown = np.where(np.logical_or(
            abs(u) > UNKNOWN_FLOW_THRESH,
            abs(v) > UNKNOWN_FLOW_THRESH
        ))
        u[idxUnknown] = 0
        v[idxUnknown] = 0

        maxu = max([-999, np.max(u)])
        maxv = max([-999, np.max(v)])
        minu = max([999, np.min(u)])
        minv = max([999, np.min(v)])

        rad = np.sqrt(np.multiply(u, u) + np.multiply(v, v))
        maxrad = max([-1, np.max(rad)])

        if self.flags['d']:
            print("Max Flow : {maxrad:.4f}. Flow Range [u, v] -> [{minu:.3f}:{maxu:.3f}, {minv:.3f}:{maxv:.3f}] ".format(
                minu = minu, minv = minv, maxu = maxu, maxv = maxv, maxrad = maxrad
            ))

        eps = np.finfo(np.float32).eps
        u = u/(maxrad + eps)
        v = v/(maxrad + eps)

        return u,v

    def _flowToColor(self, flow):

        u,v = self._normalizeFlow(flow)
        img = self._computeColor(u, v)

        # TO-DO
        # Indicate unknown flows on the image
        # Originally done as
        #
        # IDX = repmat(idxUnknown, [1 1 3]);
        # img(IDX) = 0;

        return img

    def _flowToUV(self, flow):
        u,v = self._normalizeFlow(flow)
        uv = (np.dstack([u,v])*127.999+128).astype('uint8')
        return uv

    def _saveAsPNG(self, arr, path):
        # TO-DO: No dependency
        Image.fromarray(arr).save(path)


    def convertFromFile(self, path, mode='RGB'):
        return self.convertFromFlow(self._readFlow(path), mode)

    def convertFromFlow(self, flow, mode='RGB'):
        if mode == 'RGB':
            return self._flowToColor(flow)
        if mode == 'UV':
            return self._flowToUV(flow)

        return self._flowToColor(flow)

    def convertFiles(self, files, outdir=None):
        if outdir != None and not os.path.exists(outdir):
            try:
                os.makedirs(outdir)
                print("> Created directory: " + outdir)
            except OSError as exc:
                if exc.errno != errno.EEXIST:
                    raise

        t = tqdm(files)
        for f in t:
            image = self.convertFromFile(f)

            if outdir == None:
                path = f + '.png'
                t.set_description(path)
                self._saveAsPNG(image, path)
            else:
                path = os.path.join(outdir, os.path.basename(f) + '.png')
                t.set_description(path)
                self._saveAsPNG(image, path)



