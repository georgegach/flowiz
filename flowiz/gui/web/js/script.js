// APP CONFIG
window.UI = {
    config: {
        debug: true
    },

    props: {
        play: false,
        framerate: 2,
        entriesLength: 0,
        entriesProgress: 0,
        entriesActive: 0,
        entries: []
    },

}

// APP FUNCTIONS

function log(msg) {
    if (UI.config.debug) {
        console.log(msg)
    }
}

String.prototype.toElement = function () {
    var template = document.createElement('template');
    html = this.trim(); // Never return a text node of whitespace as the result
    template.innerHTML = html;
    return template.content.firstChild;
}

// APP MODULES

UI.Dropzone = {
    e: document.querySelector('#dpz'),
    state: {
        uploading: () => new Promise(resolve => {
            log("uploading")
            UI.Dropzone.e.classList.add('uploading')
            resolve()
        }),

        uploaded: () => new Promise(resolve => {
            log("uploaded")
            UI.Dropzone.e.classList.remove('uploading')
            setTimeout(() => {
                UI.Dropzone.e.classList.add('done')
                setTimeout(() => {
                    UI.Dropzone.e.classList.add('hidden')
                    resolve()
                }, 200)
            }, 0)
        }),

        unhide: () => new Promise(resolve => {
            log('unhiding dropzone')
            UI.Dropzone.e.classList.remove('hidden')
            setTimeout(() => {
                UI.Dropzone.e.classList.remove('done')
                resolve()
            }, 200)
        }),


        reset: () => new Promise(resolve => {
            log("reset")
            var dpz = Dropzone.forElement("#dpz")
            dpz.emit("reset");
            UI.Viewer.state.hidden().then(UI.Dropzone.state.unhide);
            UI.props.entries = []
            UI.props.entriesLength = 0;
            UI.props.entriesProgress = 0;
            UI.props.entriesActive = 0;
            resolve()
        }),

        test: () => {
            UI.Dropzone.state.uploading()
                .then(UI.Dropzone.state.uploaded)
                .then(UI.Dropzone.state.reset)
        }
    }

}

UI.Viewer = {
    e: document.querySelector('#viewer'),
    c: document.querySelector("#carousel"),
    m: document.querySelectorAll('.materialboxed'),
    col: document.querySelector('#collection'),
    canvas: document.querySelector("#canvas"),
    u: document.querySelector('#u'),
    v: document.querySelector('#v'),

    state: {
        hidden: () => new Promise(resolve => {
            UI.Viewer.e.classList.remove('loaded')
            resolve()
        }),

        loaded: () => new Promise(resolve => {
            UI.Viewer.e.classList.add('loaded')
            resolve()
        }),
    },

    updateCarousel: (img) => new Promise(resolve => {
        cNode = `<a class="carousel-item materialboxed"><img src=""></a>`.toElement()
        cNode.querySelector('img').src = img.rgb
        UI.Viewer.c.appendChild(cNode)
    }),

    processPayload: (payload) => new Promise(resolve => {
        UI.props.entries.push(payload)
        UI.props.entriesProgress--;
        console.log(UI.props.entriesProgress)

        // DO SOMETHING HERE

        UI.Viewer.col.appendChild(`<a href="#" data-id="${UI.props.entriesLength - UI.props.entriesProgress - 1}" class="collection-item">${payload.name}</a>`.toElement())

        // STOP BEFORE HERE

        if (UI.props.entriesProgress == 0) {
            M.Materialbox.init(UI.Viewer.m);
            M.Tooltip.init(document.querySelectorAll('.tooltipped'), {
                enterDelay: 2000
            });
            UI.Dropzone.state.uploaded().then(UI.Viewer.state.loaded)
            UI.Viewer.col.querySelector('.collection-item').classList.add('active')
            UI.Viewer.col.querySelectorAll('.collection-item').forEach(element => {
                element.addEventListener('click', function (e) {
                    UI.props.entriesActive = e.target.getAttribute('data-id')
                    UI.Viewer.canvas.src = UI.props.entries[UI.props.entriesActive].rgb
                    UI.Viewer.u.src = UI.props.entries[UI.props.entriesActive].u
                    UI.Viewer.v.src = UI.props.entries[UI.props.entriesActive].v
                    document.querySelector(".collection-item.active").classList.remove('active')
                    element.classList.add('active')
                })
            });
            UI.Viewer.updateCanvas(payload)
            log(UI.props.entries)
        }
    }),

    updateCanvas: (payload) => new Promise(resolve => {
        document.querySelector("#saveBtn").href = payload.rgb
        document.querySelector("#saveBtn").download = payload.name + ".png"
        UI.Viewer.canvas.src = payload.rgb
        UI.Viewer.u.src = payload.u
        UI.Viewer.v.src = payload.v
    }),

}

UI.Mockup = {

    entries: [
        {
            "name": "frame_0001.flo",
            "type": "flowimage",
            "rgb": ".mockup/frame_0001.flo.png",
            "u": ".mockup/frame_0001.flo.u.png",
            "v": ".mockup/frame_0001.flo.v.png"
        }, {
            "name": "frame_0002.flo",
            "type": "flowimage",
            "rgb": ".mockup/frame_0002.flo.png",
            "u": ".mockup/frame_0002.flo.u.png",
            "v": ".mockup/frame_0002.flo.v.png"
        }, {
            "name": "frame_0003.flo",
            "type": "flowimage",
            "rgb": ".mockup/frame_0003.flo.png",
            "u": ".mockup/frame_0003.flo.u.png",
            "v": ".mockup/frame_0003.flo.v.png"
        }, {
            "name": "frame_0004.flo",
            "type": "flowimage",
            "rgb": ".mockup/frame_0004.flo.png",
            "u": ".mockup/frame_0004.flo.u.png",
            "v": ".mockup/frame_0004.flo.v.png"
        }, {
            "name": "frame_0005.flo",
            "type": "flowimage",
            "rgb": ".mockup/frame_0005.flo.png",
            "u": ".mockup/frame_0005.flo.u.png",
            "v": ".mockup/frame_0005.flo.v.png"
        },
    ],

    loadImages: () => new Promise(resolve => {
        UI.props.entriesLength = UI.Mockup.entries.length
        UI.props.entriesProgress = UI.Mockup.entries.length
        UI.Mockup.entries.forEach(payload => {
            UI.Viewer.processPayload(payload)
        });
    })

}

document.addEventListener("DOMContentLoaded", function () {

    try {
        eel.expose(confirm)
        function confirm(result) {
            // probably unnecessary
        }

        eel.expose(generate)
        function generate(payload) {
            UI.Viewer.processPayload(payload)
        }
    } catch (error) {
        console.log('Eel Communication Error')
        if (UI.config.debug) {
            log("Mockup-mode active")
            UI.Mockup.loadImages()
        }
    }


    M.Modal.init(document.querySelectorAll('.modal'), {});

});

document.querySelector("#nextBtn").addEventListener("click", function () {
    log("next")
    UI.props.entriesActive++
    if (UI.props.entriesActive == UI.props.entriesLength) {
        UI.props.entriesActive = 0
    }
    UI.Viewer.updateCanvas(UI.props.entries[UI.props.entriesActive])
    document.querySelector(".collection-item.active").classList.remove('active')
    document.querySelectorAll(".collection-item")[UI.props.entriesActive].classList.add('active')
})

document.querySelector("#prevBtn").addEventListener("click", function () {
    log("prev")
    UI.props.entriesActive--
    if (UI.props.entriesActive == -1) {
        UI.props.entriesActive = UI.props.entriesLength - 1
    }
    UI.Viewer.updateCanvas(UI.props.entries[UI.props.entriesActive])
    document.querySelector(".collection-item.active").classList.remove('active')
    document.querySelectorAll(".collection-item")[UI.props.entriesActive].classList.add('active')
})

function playback() {
    log("play")

    if (UI.props.play) {
        setTimeout(() => {
            UI.props.entriesActive++
            if (UI.props.entriesActive == UI.props.entriesLength) {
                UI.props.entriesActive = 0
            }
            UI.Viewer.updateCanvas(UI.props.entries[UI.props.entriesActive])
            document.querySelector(".collection-item.active").classList.remove('active')
            document.querySelectorAll(".collection-item")[UI.props.entriesActive].classList.add('active')
            window.requestAnimationFrame(playback)
        }, 1000.0 / UI.props.framerate)
    }

}

document.querySelector("#playBtn").addEventListener("click", function (e) {
    UI.props.play = !UI.props.play
    document.querySelector("#playBtn").classList.toggle("active")
    playback()
})

document.addEventListener('keyup', function (event) {
    if (event.defaultPrevented) {
        return;
    }

    log(event.key, event.keycode)
    var key = event.key || event.keyCode;
    if (key === 'ArrowRight' || key === 39 || key === 'ArrowDown' || key === 40) {
        var event = document.createEvent("HTMLEvents")
        event.initEvent("click", true, false)
        document.querySelector('#nextBtn').dispatchEvent(event)
    }
    if (key === 'ArrowLeft' || key === 37 || key === 'ArrowUp' || key === 37) {
        var event = document.createEvent("HTMLEvents")
        event.initEvent("click", true, false)
        document.querySelector('#prevBtn').dispatchEvent(event)
    }

    if (key === ' ' || key === 32) {
        var event = document.createEvent("HTMLEvents")
        event.initEvent("click", true, false)
        document.querySelector('#playBtn').dispatchEvent(event)
    }

    if (key === 's' || key === 83) {
        log("saving")
        // var event = document.createEvent("HTMLEvents")
        // event.initEvent("click", true, false)
        document.querySelector('#saveBtn').click()
    }

    if (key === 'Escape' || key === 27) {
        UI.Dropzone.state.reset()
    }

});

Dropzone.options.dpz = {
    url: '/',
    autoProcessQueue: false,
    uploadMultiple: true,
    maxentriesize: null,
    init: function () {
        this.on("addedfile", function (file) {
            var reader = new FileReader();
            reader.onload = function (event) {
                eel.upload({
                    'name': file.name,
                    'type': 'flo',
                    'content': event.target.result,
                    'path': file.path
                });
                UI.props.entriesLength++;
                UI.props.entriesProgress++;
            };
            reader.readAsDataURL(file);
            UI.Dropzone.state.uploading()
        });
    },
    accept: function (file, done) {
        this.emit("success", file);
        // this.emit("complete", file);
    }
};