// APP CONFIG
var Dropzone = window.Dropzone;
var M = window.M;
var UI = window.UI = {
    config: {
        debug: true,
        mockup: true,
    },

    props: {
        play: false,
        framerate: 12,
        entriesLength: 0,
        entriesProgress: 0,
        entriesActive: 0,
        entries: {}
    },

}

// APP FUNCTIONS

function log(...msg) {
    if (UI.config.debug) {
        console.log(msg);
    }
}

String.prototype.toElement = function () {
    var template = document.createElement("template");
    var html = this.trim(); // Never return a text node of whitespace as the result
    template.innerHTML = html;
    return template.content.firstChild;
}

function playback() {
    log("play");
    if (UI.props.play) {
        setTimeout(() => {
            UI.Viewer.nextBtn.click();
            window.requestAnimationFrame(playback);
        }, 1000.0 / UI.props.framerate);
    }

}

function toggleFullScreen() {
    if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen();
    } else {
        if (document.exitFullscreen) {
            document.exitFullscreen();
        }
    }
}


// APP MODULES

UI.Dropzone = {
    e: document.querySelector("#dpz"),
    state: {
        uploading: () => new Promise((resolve) => {
            log("uploading");
            UI.Dropzone.e.classList.add("uploading");
            resolve();
        }),

        uploaded: () => new Promise((resolve) => {
            log("uploaded");
            UI.Dropzone.e.classList.remove("uploading");
            setTimeout(() => {
                UI.Dropzone.e.classList.add("done");
                setTimeout(() => {
                    UI.Dropzone.e.classList.add("hidden");
                    resolve();
                }, 200);
            }, 0);
        }),

        unhide: () => new Promise((resolve) => {
            log("unhiding dropzone");
            UI.Dropzone.e.classList.remove("hidden");
            setTimeout(() => {
                UI.Dropzone.e.classList.remove("done");
                resolve();
            }, 200);
        }),


        reset: () => new Promise((resolve) => {
            log("reset");
            UI.Viewer.col.querySelector(".collection-item.active").classList.remove("active");
            var dpz = Dropzone.forElement("#dpz");
            dpz.emit("reset");
            dpz.removeAllFiles();
            UI.Viewer.state.hidden().then(UI.Dropzone.state.unhide);
            resolve();
        }),

        test: () => {
            UI.Dropzone.state.uploading()
                .then(UI.Dropzone.state.uploaded)
                .then(UI.Dropzone.state.reset);
        }
    }

};

UI.Viewer = {
    e: document.querySelector("#viewer"),
    c: document.querySelector("#carousel"),
    m: document.querySelectorAll(".materialboxed"),
    col: document.querySelector("#collection"),
    canvas: document.querySelector("#canvas"),
    u: document.querySelector("#u"),
    v: document.querySelector("#v"),
    nextBtn: document.querySelector("#nextBtn"),
    prevBtn: document.querySelector("#prevBtn"),

    state: {
        hidden: () => new Promise((resolve) => {
            UI.Viewer.e.classList.remove("loaded");
            resolve();
        }),

        loaded: () => new Promise((resolve) => {
            UI.Viewer.e.classList.add("loaded");
            resolve();
        }),
    },


    processPayload: (payload) => new Promise((resolve) => {
        var nameid = String(payload.name).replace(".", "").replace("_", "");
        UI.props.entriesActive = nameid;
        UI.props.entries[nameid] = payload;
        UI.props.entriesProgress--;
        log(UI.props.entriesProgress);

        // DO SOMETHING HERE

        UI.Viewer.col.appendChild(`<a href="#" id="${nameid}" class="collection-item">${payload.name}</a>`.toElement());

        // STOP BEFORE HERE

        if (UI.props.entriesProgress === 0) {
            M.Materialbox.init(UI.Viewer.m);
            M.Tooltip.init(document.querySelectorAll(".tooltipped"), {
                enterDelay: 100
            });
            UI.Dropzone.state.uploaded().then(UI.Viewer.state.loaded);
            UI.Viewer.col.querySelectorAll(".collection-item").forEach((element) => {
                element.addEventListener("click", function (e) {
                    UI.props.entriesActive = e.target.id;
                    UI.Viewer.canvas.src = UI.props.entries[UI.props.entriesActive].rgb;
                    UI.Viewer.u.src = UI.props.entries[UI.props.entriesActive].u;
                    UI.Viewer.v.src = UI.props.entries[UI.props.entriesActive].v;
                    document.querySelector(".collection-item.active").classList.remove("active");
                    element.classList.add("active");
                })
            });
            document.querySelector(`.collection-item#${UI.props.entriesActive}`).classList.add("active");
            UI.Viewer.updateCanvas(UI.props.entries[UI.props.entriesActive]);
            log(UI.props.entries);
        }
        resolve();
    }),

    updateCanvas: (payload) => new Promise((resolve) => {
        document.querySelector("#saveBtn").href = payload.rgb;
        document.querySelector("#saveBtn").download = payload.name + ".png";
        UI.Viewer.canvas.src = payload.rgb;
        UI.Viewer.u.src = payload.u;
        UI.Viewer.v.src = payload.v;
    }),

};

UI.Mockup = {

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
        UI.props.entriesLength = UI.Mockup.entries.length;
        UI.props.entriesProgress = UI.Mockup.entries.length;
        UI.Mockup.entries.forEach((payload) => {
            UI.Viewer.processPayload(payload);
        });
    }),

};


// HTML LOADED
document.addEventListener("DOMContentLoaded", function () {

    try {
        function confirm(result) {
            // Dropzone.forElement("#dpz").removeAllFiles();
        }
        window.eel.expose(confirm);

        function generate(payload) {
            UI.Viewer.processPayload(payload);
        }
        window.eel.expose(generate);
    } catch (error) {
        log("Eel Communication Error");
        if (UI.config.mockup) {
            log("Mockup-mode active");
            UI.Mockup.loadImages();
        }
    }


    M.Modal.init(document.querySelectorAll(".modal"), {});

    UI.Viewer.nextBtn.addEventListener("click", function () {
        log("next");
        var activeElement = document.querySelector(`a#${UI.props.entriesActive}`);
        var newElement = activeElement.nextSibling;
        if (newElement === null) {
            newElement = document.querySelector(".collection-item");
        }
        activeElement.classList.remove("active");
        newElement.classList.add("active");
        UI.props.entriesActive = newElement.id;
        UI.Viewer.updateCanvas(UI.props.entries[UI.props.entriesActive]);
    });

    UI.Viewer.prevBtn.addEventListener("click", function () {
        log("prev");
        var activeElement = document.querySelector(`a#${UI.props.entriesActive}`);
        var newElement = activeElement.previousSibling;
        if (newElement.classList === undefined) {
            newElement = document.querySelector(".collection-item:last-child");
        }
        newElement.classList.add("active");
        activeElement.classList.remove("active");
        UI.props.entriesActive = newElement.id
        UI.Viewer.updateCanvas(UI.props.entries[UI.props.entriesActive]);
    });

    document.querySelector("#playBtn").addEventListener("click", function (e) {
        UI.props.play = !UI.props.play;
        document.querySelector("#playBtn").classList.toggle("active");
        playback();
    });

    document.querySelector("#fullscreenBtn").addEventListener("click", function (e) {
        setTimeout(() => { toggleFullScreen() }, 100);
    });

    document.querySelector("#escBtn").addEventListener("click", function (e) {
        setTimeout(() => { UI.Dropzone.state.reset(); }, 100);
    });


    document.addEventListener("keyup", function (event) {
        if (event.defaultPrevented) {
            return;
        }

        log(event.key, event.keycode);
        var key = event.key || event.keyCode;

        if (key === "ArrowRight" || key === 39 || key === "ArrowDown" || key === 40)    { UI.Viewer.nextBtn.click();}
        if (key === "ArrowLeft" || key === 37 || key === "ArrowUp" || key === 37)       { UI.Viewer.prevBtn.click();}
        if (key === " "         || key === 32)                                          { document.querySelector("#playBtn").click();}
        if (key === "s"         || key === 83)                                          { log("saving"); document.querySelector("#saveBtn").click();}
        if (key === "Escape" || key === 27)                                             { UI.Dropzone.state.reset();}
    });
});


// MODULE FUNCTIONS




Dropzone.options.dpz = {
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
};
