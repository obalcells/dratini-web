let board1 = null;
let dratini = null;
let game = new Chess();
let score = 0;
let computerSide = "black";

const $ = (...args) => document.querySelector(...args);

const formatMB = (n) => {
    return (n ? (n / 1e6).toPrecision(3) : "?") + "MB";
};

const isSupported = () => {
    if (typeof WebAssembly !== "object") return false;
    const source = Uint8Array.from([
    0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 7, 8,
    1, 4, 116, 101, 115, 116, 0, 0, 10, 15, 1, 13, 0, 65, 0, 253, 17, 65, 0,
    253, 17, 253, 186, 1, 11,
    ]);
    if (
    typeof WebAssembly.validate !== "function" ||
    !WebAssembly.validate(source)
    )
    return false;
    if (typeof Atomics !== "object") return false;
    if (typeof SharedArrayBuffer !== "function") return false;
    return true;
};

const RequestProgress = ({ attrs: { url, onFinishDownload } }) => {
    let state = "INIT"; // 'LOADING', 'DONE', 'FAILED'
    let loaded = 0;
    let total = 0;

    const oninit = () => {
    state = "LOADING";
    m.request({
        url: url,
        method: "GET",
        responseType: "arraybuffer",
        headers: { Accept: "*/*" },
        config: (xhr) => {
        xhr.onprogress = (e) => {
            // TODO:
            // When gzip compressed, the value of "loaded/total" gets messed up.
            // On Chrome, "loaded" is the value after decompression, but on the other hand,
            // On Firefox, "loaded" is the value before decompression.
            loaded = e.loaded;
            total =
            e.total ||
            Number(
                e.target.getResponseHeader("x-decompressed-content-length")
            );
            m.redraw();
        };
        },
    }).then(
        (response) => {
        state = "DONE";
        onFinishDownload(response);
        },
        (e) => {
        console.error(e);
        state = "FAILED";
        onFinishDownload(null);
        }
    );
    };

    const view = () => {
    const fraction =
        total == -1 ? `?MB/?MB` : `${formatMB(loaded)}/${formatMB(total)}`;
    return m("span", [
        `${fraction} [${state}] `,
    ]);
    };

    return { oninit, view };
};

let engine_state = "INIT"; // 'READY', 'FAILED'

const App = () => {
    let output = "";
    let tail_mode = true;

    const sendCommand = () => {
    const command = $("#command").value;
    if (command.length > 0) {
        dratini.postMessage(command);
    }
    };

    const takeBack = () => {
    console.log("Takeback");   
    game.undo();
    game.undo();
    board1.position(game.fen())
    engine_state = "PROCESSING..."; 
    m.redraw();
    setTimeout(function(){ 
        dratini.postMessage("position " + game.fen());
    }, 100);
    }

    const flip = () => {
    console.log("Flipping");
    if(computerSide === "white") {
        computerSide = "black";
    } else {
        computerSide = "white";
    }
    score = -score;
    // if we flip now it's the computers' turn
    engine_state = "THINKING"; 
    m.redraw();
    setTimeout(function() { 
        dratini.postMessage("position " + game.fen());
        dratini.postMessage("go");
    }, 100);
    }

    const reset = () => {
    console.log("Resetting position");
    game.reset();
    board1.position(game.fen());
    score = 0;
    m.redraw();
    if(computerSide === "white") {
        dratini.postMessage("position " + game.fen());
        dratini.postMessage("go");
    }
    } 

    const parseLine = (line) => {
    if(line.includes("score")) {
        words = line.split(" ");
        for(let i = 0; i < words.length; i++) {
        if(words[i] == "score") {
            score = -parseInt(words[i + 1]);
            break;
        }
        }
    }
    if(!line.includes("bestmove")) {
        return;
    }
    engine_state = "READY";
    words = line.split(" ");
    for(let i = 0; i < words.length; i++) {
        if(words[i] === "bestmove") {
        let moveStr = words[i + 1];
        console.log("Making move", moveStr)
        console.log("Prev fen was", game.fen());
        // game.move(moveStr, { sloppy: true });
        let from = moveStr[0] + moveStr[1]
        let to = moveStr[2] + moveStr[3];
        let promotion = 'Q';
        if(computerSide == "black") promotion = 'q';
        console.log(game.turn());
        let move_return = game.move({
            from: from, to: to, promotion: promotion
        });
        console.log(move_return); 
        console.log("FEN is now", game.fen());
        board1.position(game.fen());
        m.redraw();
        break;
        }
    }
    }

    const scrollOutput = () => {
    if (!tail_mode) {
        return;
    }
    $("#output").scrollTo({
        top: $("#output").scrollHeight,
        behavior: "smooth",
    });
    };

    // Make error catchable
    const loadEngine = async (params) => {
    return await Dratini(params);
    };

    const onFinishDownload = (data) => {
    if (!data) {
        engine_state = "FAILED";
        m.redraw();
        return;
    }

    loadEngine({ wasmBinary: data })
        .then((_dratini) => {
        dratini = _dratini;
        engine_state = "READY";
        dratini.addMessageListener((line) => {
            parseLine(line);
            output += line + "\n";
            m.redraw();
        });
        })
        .catch((e) => {
        engine_state = "FAILED";
        throw e;
        })
        .finally(() => m.redraw());
    };

    const oninit = () => {
    engine_state = "LOADING";
    };

    const map = (value, x1, y1, x2, y2) => (value - x1) * (y2 - x2) / (y1 - x1) + x2;

    const min = (x, y) => {
    if(x < y) {
        return x;
    }
    return y;
    }

    const getColor = (score) => {
    let red = 1;
    let green = 1;
    if(score < 0) {
        red = -map(-score, 0, min(-score, 2000), 1, 255);
    } else {
        green = map(score, 0, min(score, 2000), 1, 255);
    }
    return `rgb(${red}, ${green}, 100)`;
    }

    const getSidebar = () => {
    if(engine_state === "READY") {
        return m("div#right-col", [
            m("h3#score", { style: { "background-color": "#CBCBCB", "color": getColor(score) } }, `Score is ${score}`),
            m("div#click", { onclick: takeBack }, "Take back"),
            m("div#click", { onclick: reset }, "Reset"),
            m("div#click", { onclick: flip }, "Flip")
        ]);
    } else {
        return m("div#right-col", [
            m("h3#score", { style: { "background-color": "#CBCBCB", "color": getColor(score) } }, `Score is ${score}`),
            m("div#dead-click", "Take back"),
            m("div#dead-click", "Reset"),
            m("div#dead-click", "Flip")
        ]);
    }
    }

    const view = () => {
    return m("main", [
        m("div#central-col", [
        m("div#title", "Dratini v2.0"),
        m("div#board1"),
        m("div#misc", [
            m("div", [
            "- download: ",
            m(RequestProgress, {
                url: "./lib/dratini.wasm",
                onFinishDownload,
            }),
            ]),
            m("div", `- stockfish state: ${engine_state}`),
            m("div", `- the engine plays ${computerSide}`),
            m("div", `- engine's raw UCI output:`)
        ]),
        m("div#output", { onupdate: scrollOutput }, m("pre", output)),
        ]),
        getSidebar()
    ]);
    };

    return { oninit, view };
};

m.mount($("#root"), App);

if (!isSupported()) {
    window.alert(
    "Your browser is not supported ): If you're using Chrome enable chrome://flags/#enable-webassembly-simd. If you're using Firefox enable javascript.options.wasm_simd."
    );
}

const onDrop = (source, target, piece, newPos, oldPos, orientation) => {
    // we want to check if the move is legal
    var move = game.move({
    from: source,
    to: target,
    promotion: 'q' // NOTE: always promote to a queen for example simplicity
    })

    // illegal move
    if (move === null) return 'snapback'
}

function onDragStart (source, piece, position, orientation) {
    // do not pick up pieces if the game is over
    if(game.game_over())
    return false

    // only pick up pieces for White
    if((piece.search(/^b/) !== -1 && computerSide === "white")
    || (piece.search(/^w/) !== -1 && computerSide === "black"))
    return false
}

const onSnapEnd = () => {
    board1.position(game.fen())
    engine_state = "THINKING..."; 
    m.redraw();
    setTimeout(function(){ 
    dratini.postMessage("position " + game.fen());
    dratini.postMessage("go");
    }, 100);
}

board1 = Chessboard('board1', {
    position: "start",
    draggable: true,
    onDrop: onDrop,
    onSnapEnd: onSnapEnd
});
