function log(msg) {
    if (UI.config.debug)
        console.log(msg)
}

function htmlToElement(html) {
    var template = document.createElement('template');
    html = html.trim(); // Never return a text node of whitespace as the result
    template.innerHTML = html;
    return template.content.firstChild;
}



window.UI = {

    config: {
        debug: true
    },

    props: {
        fileLength: 0
    },

    Dropzone: {
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


            reset: () => new Promise(resolve => {
                log("reset")
                UI.Dropzone.e.classList.remove('hidden')
                setTimeout(() => {
                    UI.Dropzone.e.classList.remove('done')
                    resolve()
                }, 200)
            }),

            test: () => {
                UI.Dropzone.state.uploading()
                    .then(UI.Dropzone.state.uploaded)
                    .then(UI.Dropzone.state.reset)
            }
        }
    },

    Viewer: {
        e: document.querySelector('#viewer'),
        c: document.querySelector("#carousel"),
        state: {
            hidden: () => new Promise(resolve => {
                UI.Viewer.e.classList.remove('loaded')
            }),

            loaded: () => new Promise(resolve => {
                UI.Viewer.e.classList.add('loaded')
            }),
        },

        updateCarousel: (img) => new Promise(resolve => {
            cNode = htmlToElement(`<a class="carousel-item"><img src=""></a>`)
            cNode.querySelector('img').src = img.rgb
            UI.Viewer.c.appendChild(cNode)
        })
    }
}



try {
    eel.expose(confirm)
    function confirm(result) {
    }

    eel.expose(generate)
    function generate(payload) {
        UI.Viewer.updateCarousel(payload)
        UI.props.fileLength--;
        if (UI.props.fileLength == 0) {
            M.Carousel.init(UI.Viewer.c)
            UI.Dropzone.state.uploaded().then(UI.Viewer.state.loaded)
        }
    }
} catch (error) {
    console.log('PyJS Communication Error')
}




Dropzone.options.dpz = {
    url: '/',
    autoProcessQueue: false,
    uploadMultiple: true,
    maxFilesize: null,
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
                UI.props.fileLength++;
            };
            reader.readAsDataURL(file);
            UI.Dropzone.state.uploading()
        });
    },
};



$(function () {
    log("I'm ready")

    // // UI.Dropzone.state.test()
    // UI.Dropzone.state.uploaded()
    // .then(UI.Viewer.state.loaded)

})