// APP CONFIG
window.UI = {
    config: {
        debug: false,
        mockup: true,
    },

    props: {
        play: false,
        framerate: 2,
        entriesLength: 0,
        entriesProgress: 0,
        entriesActive: 0,
        entries: [],
    },

}

// APP FUNCTIONS

function log(msg) {
    if (window.UI.config.debug) {
        console.log(msg);
    }
}

String.prototype.toElement = function () {
    var template = document.createElement("template");
    var html = this.trim(); // Never return a text node of whitespace as the result
    template.innerHTML = html;
    return template.content.firstChild;
}

// APP MODULES

window.UI.Dropzone = {
    e: document.querySelector("#dpz"),
    state: {
        uploading: () => new Promise((resolve) => {
            log("uploading");
            window.UI.Dropzone.e.classList.add("uploading");
            resolve();
        }),

        uploaded: () => new Promise((resolve) => {
            log("uploaded");
            window.UI.Dropzone.e.classList.remove("uploading");
            setTimeout(() => {
                window.UI.Dropzone.e.classList.add("done");
                setTimeout(() => {
                    window.UI.Dropzone.e.classList.add("hidden");
                    resolve();
                }, 200);
            }, 0);
        }),

        unhide: () => new Promise((resolve) => {
            log("unhiding dropzone");
            window.UI.Dropzone.e.classList.remove("hidden");
            setTimeout(() => {
                window.UI.Dropzone.e.classList.remove("done");
                resolve();
            }, 200);
        }),


        reset: () => new Promise((resolve) => {
            log("reset");
            var dpz = window.Dropzone.forElement("#dpz");
            dpz.emit("reset");
            window.UI.Viewer.state.hidden().then(window.UI.Dropzone.state.unhide);
            window.UI.props.entries = [];
            window.UI.props.entriesLength = 0;
            window.UI.props.entriesProgress = 0;
            window.UI.props.entriesActive = 0;
            resolve();
        }),

        test: () => {
            window.UI.Dropzone.state.uploading()
                .then(window.UI.Dropzone.state.uploaded)
                .then(window.UI.Dropzone.state.reset);
        }
    }

}

window.UI.Viewer = {
    e: document.querySelector("#viewer"),
    c: document.querySelector("#carousel"),
    m: document.querySelectorAll(".materialboxed"),
    col: document.querySelector("#collection"),
    canvas: document.querySelector("#canvas"),
    u: document.querySelector("#u"),
    v: document.querySelector("#v"),

    state: {
        hidden: () => new Promise((resolve) => {
            window.UI.Viewer.e.classList.remove("loaded");
            resolve();
        }),

        loaded: () => new Promise((resolve) => {
            window.UI.Viewer.e.classList.add("loaded");
            resolve();
        }),
    },

    updateCarousel: (img) => new Promise((resolve) => {
        var cNode = `<a class="carousel-item materialboxed"><img src=""></a>`.toElement();
        cNode.querySelector("img").src = img.rgb;
        window.UI.Viewer.c.appendChild(cNode);
        resolve();
    }),

    processPayload: (payload) => new Promise((resolve) => {
        window.UI.props.entries.push(payload);
        window.UI.props.entriesProgress--;
        log(window.UI.props.entriesProgress);

        // DO SOMETHING HERE

        window.UI.Viewer.col.appendChild(`<a href="#" data-id="${window.UI.props.entriesLength - window.UI.props.entriesProgress - 1}" class="collection-item">${payload.name}</a>`.toElement());

        // STOP BEFORE HERE

        if (window.UI.props.entriesProgress === 0) {
            window.M.Materialbox.init(window.UI.Viewer.m);
            window.M.Tooltip.init(document.querySelectorAll(".tooltipped"), {
                enterDelay: 2000
            });
            window.UI.Dropzone.state.uploaded().then(window.UI.Viewer.state.loaded);
            window.UI.Viewer.col.querySelector(".collection-item").classList.add("active");
            window.UI.Viewer.col.querySelectorAll(".collection-item").forEach((element) => {
                element.addEventListener("click", function (e) {
                    window.UI.props.entriesActive = e.target.getAttribute("data-id");
                    window.UI.Viewer.canvas.src = window.UI.props.entries[window.UI.props.entriesActive].rgb;
                    window.UI.Viewer.u.src = window.UI.props.entries[window.UI.props.entriesActive].u;
                    window.UI.Viewer.v.src = window.UI.props.entries[window.UI.props.entriesActive].v;
                    document.querySelector(".collection-item.active").classList.remove("active");
                    element.classList.add("active");
                });
            });
            window.UI.Viewer.updateCanvas(window.UI.props.entries[0]);
            log(window.UI.props.entries);
        }
        resolve();
    }),

    updateCanvas: (payload) => new Promise((resolve) => {
        document.querySelector("#saveBtn").href = payload.rgb;
        document.querySelector("#saveBtn").download = payload.name + ".png";
        window.UI.Viewer.canvas.src = payload.rgb;
        window.UI.Viewer.u.src = payload.u;
        window.UI.Viewer.v.src = payload.v;
        resolve();
    }),

};

window.UI.mockup = {

    entries: [
        {
            "name": "frame_0001.flo",
            "type": "flowimage",
            "rgb": "mockup/frame_0001.flo.png",
            "u": "mockup/frame_0001.flo.u.png",
            "v": "mockup/frame_0001.flo.v.png"
        }, {
            "name": "frame_0002.flo",
            "type": "flowimage",
            "rgb": "mockup/frame_0002.flo.png",
            "u": "mockup/frame_0002.flo.u.png",
            "v": "mockup/frame_0002.flo.v.png"
        }, {
            "name": "frame_0003.flo",
            "type": "flowimage",
            "rgb": "mockup/frame_0003.flo.png",
            "u": "mockup/frame_0003.flo.u.png",
            "v": "mockup/frame_0003.flo.v.png"
        }, {
            "name": "frame_0004.flo",
            "type": "flowimage",
            "rgb": "mockup/frame_0004.flo.png",
            "u": "mockup/frame_0004.flo.u.png",
            "v": "mockup/frame_0004.flo.v.png"
        }, {
            "name": "frame_0005.flo",
            "type": "flowimage",
            "rgb": "mockup/frame_0005.flo.png",
            "u": "mockup/frame_0005.flo.u.png",
            "v": "mockup/frame_0005.flo.v.png"
        },
    ],

    loadImages: () => new Promise((resolve) => {
        window.UI.props.entriesLength = window.UI.mockup.entries.length;
        window.UI.props.entriesProgress = window.UI.mockup.entries.length;
        window.UI.mockup.entries.forEach((payload) => {
            window.UI.Viewer.processPayload(payload);
        });
    }),

};

document.addEventListener("DOMContentLoaded", function () {

    try {
        function confirm(result) {
            // probably unnecessary
        }
        window.eel.expose(confirm);

        function generate(payload) {
            window.UI.Viewer.processPayload(payload);
        }
        window.eel.expose(generate);
    } catch (error) {
        log("Eel Communication Error");
        if (window.UI.config.mockup) {
            log("Mockup-mode active");
            window.UI.mockup.loadImages();
        }
    }


    window.M.Modal.init(document.querySelectorAll(".modal"), {});

});

document.querySelector("#nextBtn").addEventListener("click", function () {
    log("next");
    window.UI.props.entriesActive++;
    if (window.UI.props.entriesActive === window.UI.props.entriesLength) {
        window.UI.props.entriesActive = 0;
    }
    window.UI.Viewer.updateCanvas(window.UI.props.entries[window.UI.props.entriesActive]);
    document.querySelector(".collection-item.active").classList.remove("active");
    document.querySelectorAll(".collection-item")[window.UI.props.entriesActive].classList.add("active");
});

document.querySelector("#prevBtn").addEventListener("click", function () {
    log("prev");
    window.UI.props.entriesActive--;
    if (window.UI.props.entriesActive === -1) {
        window.UI.props.entriesActive = window.UI.props.entriesLength - 1;
    }
    window.UI.Viewer.updateCanvas(window.UI.props.entries[window.UI.props.entriesActive]);
    document.querySelector(".collection-item.active").classList.remove("active");
    document.querySelectorAll(".collection-item")[window.UI.props.entriesActive].classList.add("active");
});

function playback() {
    log("play");

    if (window.UI.props.play) {
        setTimeout(() => {
            window.UI.props.entriesActive++;
            if (window.UI.props.entriesActive === window.UI.props.entriesLength) {
                window.UI.props.entriesActive = 0;
            }
            window.UI.Viewer.updateCanvas(window.UI.props.entries[window.UI.props.entriesActive]);
            document.querySelector(".collection-item.active").classList.remove("active");
            document.querySelectorAll(".collection-item")[window.UI.props.entriesActive].classList.add("active");
            window.requestAnimationFrame(playback);
        }, 1000.0 / window.UI.props.framerate);
    }

}

document.querySelector("#playBtn").addEventListener("click", function (e) {
    window.UI.props.play = !window.UI.props.play;
    document.querySelector("#playBtn").classList.toggle("active");
    playback();
});

document.addEventListener("keyup", function (event) {
    if (event.defaultPrevented) {
        return;
    }

    var newEvent = document.createEvent("HTMLEvents");
    newEvent.initEvent("click", true, false);

    log(event.key, event.keycode);
    var key = event.key || event.keyCode;
    if (key === "ArrowRight" || key === 39 || key === "ArrowDown" || key === 40) {
        document.querySelector("#nextBtn").dispatchEvent(event);
    }
    if (key === "ArrowLeft" || key === 37 || key === "ArrowUp" || key === 37) {
        document.querySelector("#prevBtn").dispatchEvent(event);
    }

    if (key === " " || key === 32) {
        document.querySelector("#playBtn").dispatchEvent(event);
    }

    if (key === "s" || key === 83) {
        log("saving");
        // var newEvent = document.createEvent("HTMLEvents");
        // newEvent.initEvent("click", true, false);
        document.querySelector("#saveBtn").click();
    }

    if (key === "Escape" || key === 27) {
        window.UI.Dropzone.state.reset();
    }

});

window.Dropzone.options.dpz = {
    url: "/",
    autoProcessQueue: false,
    uploadMultiple: true,
    maxentriesize: null,
    init() {
        this.on("addedfile", function (file) {
            var reader = new FileReader();
            reader.onload = function (event) {
                window.eel.upload({
                    "name": file.name,
                    "type": "flo",
                    "content": event.target.result,
                    "path": file.path
                });
                window.UI.props.entriesLength++;
                window.UI.props.entriesProgress++;
            };
            reader.readAsDataURL(file);
            window.UI.Dropzone.state.uploading();
        });
    },
    accept(file, done) {
        this.emit("success", file);
        // this.emit("complete", file);
    }
};
