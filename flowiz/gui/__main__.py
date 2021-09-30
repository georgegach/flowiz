import eel
import os
import io
import flowiz as fz
import base64
import re
import shutil
import matplotlib.pyplot as plt
from .index import generate_index_html


accessdir = 'guitemp'
savedir = os.path.join(
    os.path.join(
        os.path.dirname(__file__),
        'web'
    ),
    accessdir
)




@eel.expose
def upload(file):
    eel.confirm(file['name'])
    rgb, u, v = create_b64_image(file)
    generate_index_html(savedir, accessdir, os.path.join(savedir,"index.html"))
    eel.generate({
        'name': file['name'],
        'type': 'flowimage',
        'rgb': rgb,
        'u': u,
        'v': v,
    })



def save_image(arr, name, cmap=None):
    filename = os.path.join(savedir, name + '.png')
    plt.imsave(filename, arr, cmap=cmap)
    return os.path.join(
        accessdir,
        os.path.basename(filename)
    )

def create_b64_image(payload):
    def buffered_flo(content):
        clean = re.sub("data:application/octet-stream;base64,", '', content)
        floBytes = io.BytesIO(base64.b64decode(clean))
        return io.BufferedReader(floBytes)

    img = fz.convert_from_file(buffered_flo(payload['content']))
    uv = fz.convert_from_file(buffered_flo(payload['content']), mode='uv')

    rgb = save_image(img, payload['name'])
    u = save_image(uv[...,0], payload['name']+'.u', cmap='binary')
    v = save_image(uv[...,1], payload['name']+'.v', cmap='binary')
    return rgb, u, v


def create_or_clean_tempfolder(folpath):
    if os.path.exists(folpath):
        shutil.rmtree(folpath)
    os.mkdir(folpath)


if __name__ == '__main__':
    create_or_clean_tempfolder(savedir)
    print('> GUI webpath:', os.path.join(os.path.dirname(__file__), 'web'))
    eel.init(os.path.join(os.path.dirname(__file__), 'web'))
    eel.start('index.html', cmdline_args=['--disable-http-cache'])