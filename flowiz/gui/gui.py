import eel
import os

class gui(object):

    def __init__(self):
        print('Flowiz GUI initialized')

    @staticmethod
    def main():
        print('> webpath:', os.path.join(os.path.dirname(__file__), 'web'))
        eel.init(os.path.join(os.path.dirname(__file__), 'web'))
        eel.start('index.html', options={'chromeFlags': ['--disable-http-cache']})

if __name__ == '__main__':
    gui.main()