const NAMES = []
const NAME_MAP = {}
const TYPING = {}

let CURRENT_GUESS = 0;
const GUESS_LIMIT = 8;

const CONFIRMED = [];
const ELIMINATED = [];

let ANSWER = [];

function on_load() {

    // $("#info_dialog").dialog();

    DEX.forEach(function (p) {
        NAMES.push(p.n);
        NAME_MAP[p.n] = p;
        let t_str = p.t.join("|")
        if (TYPING[t_str])
            TYPING[t_str].push(p)
        else
            TYPING[t_str] = [p]
    });

    let dataList = $("datalist")
    NAMES.forEach(function (n) {
        dataList.append(`<option value=${n}/>`)
    });

    for (let i = 0; i < GUESS_LIMIT; i++)
        add_row();

    $('#info_button')[0].addEventListener("click", function () {
        $("#info_dialog").dialog("open");
    });

    fetch_answer();
}


function fetch_answer() {
    let url = `https://api.wurmple.sprelf.com/generate`;
    $.ajax({
        url: `${url}`,
        method: "POST",
        cors: true,
        data: "{}",
        dataType: "json",
        contentType: "application/json",
        success: function (result) {
            console.log(result);
            ANSWER = result["seq"];
            focus_row(0);
        },
        error: function (xhr, options, error) {
            console.log(xhr);
            set_message("Could not retrieve a puzzle for you to solve.  Try refreshing the page.");
        }
    });
}

function add_row() {
    let new_row = $("<tr></tr>")
    for (let i = 0; i < 5; i++) {
        let td = $(`<td></td>`);
        let input = $(`<input class="pok_input pending_pok_input" name="input${i}" list="pok" readonly/>`)
        td.append(input);
        input[0].addEventListener("focusout", function (e) {
            e.target.value = e.target.value.toUpperCase();
        });
        new_row.append(td);
    }
    $("#input_table").append(new_row);
}

function unfocus_row(row_index) {
    let row = $("#input_table").children("tr").get()[row_index];

    $(row).find(".pok_input").each(function () {
        $(this).attr("readonly", true);
    });

    $(row).find(".guess_button").remove();
}

function focus_row(row_index) {
    CURRENT_GUESS = row_index;

    let table = $("#input_table");
    let row = $(table).children("tr")[row_index];

    $(row).find(".pok_input").each(function () {
        $(this).attr("readonly", false);
        $(this).removeClass("pending_pok_input");
    });

    let button = $("<button class='guess_button'>Guess</button>")
    button[0].addEventListener("click", function () {
        check_guess(button);
    });
    let td = $("<td></td>");
    $(td).append(button[0])
    $(row).append(td[0]);
}


function check_guess(button) {
    set_message("");
    let row = button.parent().parent().find(".pok_input").get();
    row.sort(function (a, b) {
        return $(a).attr("name").localeCompare($(b).attr("name"));
    });
    let sequence = row.map(function (elem) {
        $(elem).removeClass("invalid_guess");
        return elem.value.toUpperCase();
    });
    console.log(sequence.join(" | "));

    let invalid_pokemon = get_invalid_pokemon(sequence);
    if (invalid_pokemon.length > 0)
    {
        invalid_pokemon.forEach(function (i) {
            $(row[i]).addClass("invalid_guess").addClass("shaker");
            setTimeout(function () {
                $(row[i]).removeClass("shaker");
            }, 500);
        });
        set_message("Could not identify Pokémon.");
        return;
    }

    let duplicates = get_duplicates(sequence);
    if (duplicates.length > 0)
    {
        duplicates.forEach(function (i) {
            $(row[i]).addClass("invalid_guess").addClass("shaker");
            setTimeout(function () {
                $(row[i]).removeClass("shaker");
            }, 500);
        });
        set_message("Cannot guess the same Pokémon multiple times.");
        return;
    }

    let invalid_guesses = get_invalid_guesses(sequence);
    if (invalid_guesses.length > 0)
    {
        invalid_guesses.forEach(function (i) {
            $(row[i]).addClass("invalid_guess").addClass("shaker");
            setTimeout(function () {
                $(row[i]).removeClass("shaker");
            }, 500);
        });
        set_message("Invalid sequence; each Pokémon must share a type with its neighbors.");
        return;
    }

    console.log("VALID GUESS!")

    let result = evaluate_guess(sequence, ANSWER.map(function (a) {
        return NAME_MAP[a].t;
    }));

    row.forEach(function (elem, i) {
        $(elem).addClass(result[i])
    });

    unfocus_row(CURRENT_GUESS);
    if (result.every(function (r) { return r === "exact_match"; }))
        game_success();
    else
    {
        if (CURRENT_GUESS + 1 === GUESS_LIMIT)
            game_failure();
        else
            focus_row(CURRENT_GUESS + 1);
    }
}


function get_invalid_pokemon(sequence) {
    return sequence.map(function (p, i) {
        return NAME_MAP[p] ? null : i;
    }).filter(function (e) {
        return e !== null;
    });
}


function get_duplicates(sequence) {
    return sequence.map(function (p, i) {
        return sequence.some(function (p2, i2) {
            return p === p2 && i !== i2;
        }) ? i : null;
    }).filter(function (e) {
        return e !== null;
    });
}


function get_invalid_guesses(sequence) {

    return sequence.map(function (p, i) {
        return (i === 0 || NAME_MAP[sequence[i - 1]].t.some(function (t) {
            return NAME_MAP[p].t.includes(t);
        })) ? null : i;
    }).filter(function (e) {
        return e !== null;
    });

}


function evaluate_guess(sequence, answer) {

    let result = [null, null, null, null, null];
    sequence = sequence.map(function (p) {
        return NAME_MAP[p];
    });
    let remaining = answer.map(function (typing) { return typing.map(function (t) { return t; })});

    result = evaluate(sequence, result, "exact_match",
        function (p, i) {
            if (p.t.length !== remaining[i].length || !p.t.every(function (t, ti) {
                return remaining[i][ti] === t;
            }))
                return false;
            remaining[i] = remaining[i].map(function () { return null; });
            return true;
        });

    result = evaluate(sequence, result, "exact_misaligned_and_partial_match",
        function (p, i) {
            return remaining.some(function (a, ai) {
                if (p.t.length !== a.length || !p.t.every(function (t, ti) {
                    return a[ti] === t;
                }))
                    return false;

                // remaining[ai] = remaining[ai].map(function () { return null; });
                return true;
            }) && p.t.some(function (t) {
                return answer[i].includes(t);
            });
        });

    result = evaluate(sequence, result, "exact_misaligned",
        function (p, i) {
            return answer.some(function (a, ai) {
                if (p.t.length !== a.length || !p.t.every(function (t, ti) {
                    return a[ti] === t;
                }))
                    return false;

                // remaining[ai] = remaining[ai].map(function () { return null; });
                return true;
            });
        });

    result = evaluate(sequence, result, "partial_match",
        function (p, i) {
            if (!p.t.some(function (t) {
                return answer[i].includes(t);
            }))
                return false;

            // remaining[i] = remaining[i].map(function (t) { return p.t.includes(t) ? null : t; });
            return true;
        });


    result = evaluate(sequence, result, "partial_misaligned",
        function (p, i) {
            return remaining.some(function (a, ai) {
                if (!p.t.some(function (t) {
                    return a.includes(t);
                }))
                    return false;

                // remaining[ai] = remaining[ai].map(function (t) { return p.t.includes(t) ? null : t; });
                return true;
            });
        });

    result = evaluate(sequence, result, "no_match", function (p, i) { return true; });

    eliminate_types(sequence, result);

    return result;
}


function evaluate(sequence, results, identifier, evaluator) {
    return sequence.map(function (s, i) {
        if (results[i] !== null)
            return results[i];
        if (evaluator(s, i))
            return identifier;
        return null;
    });
}

function eliminate_types(sequence, result) {
    let dead = result.map(function (r, i) {
        if (r !== "no_match") return null;

        let p = sequence[i];
        return p.t;
    }).filter(function (x) { return x !== null; }).flat();

    // result.forEach(function (r, i) {
    //     if (!["partial_match", "partial_misaligned", "exact_misaligned_and_partial_match"].includes(r)) return;
    //
    //     let p = sequence[i];
    //     p.t.forEach(function (t) {
    //         while (dead.indexOf(t) !== -1) dead.splice(dead.indexOf(t), 1);
    //     });
    // });

    dead.forEach(function (t) {
        $("#typing_table").find(`span.${t.toLowerCase()}`).addClass("type_excluded").removeClass(t.toLowerCase());
    });

    result.forEach(function (r, i) {
        let p = sequence[i];
        if (["exact_match", "exact_misaligned", "exact_misaligned_and_partial_match"].includes(r)) {

            if (!CONFIRMED.some(function (c) {
                return c.length === p.t.length && c.every(function (t, ti) {
                    return t === p.t[ti];
                });
            })) CONFIRMED.push(p.t);
        }
        else {
            if (!ELIMINATED.some(function (e) {
                return e.length === p.t.length && e.every(function (t, ti) {
                    return t === p.t[ti];
                });
            })) ELIMINATED.push(p.t);
        }
    });

    if (CONFIRMED.length > 0) {
        let confirmed = $("#confirmed_column .typing_list");
        $(confirmed).empty();
        CONFIRMED.forEach(function (c) {
            let div = $("<div class='typing_pair'></div>")
            c.forEach(function (t) {
                div.append(`<span class="type ${t.toLowerCase()}">`)
            });
            confirmed.append(div);
        });
    }

    if (ELIMINATED.length > 0) {
        let eliminated = $("#eliminated_column .typing_list");
        $(eliminated).empty();
        ELIMINATED.forEach(function (e) {
            let div = $("<div class='typing_pair'></div>")
            e.forEach(function (t) {
                div.append(`<span class="type sm ${t.toLowerCase()}"/>`)
            });
            eliminated.append(div);
        });
    }
}

function game_failure() {
    set_message(`Nice try!  The answer was: ${ANSWER.join(" ==> ")}`);
}

function game_success() {
    set_message(`Good work, you win! 🎉<br/>The Pokémon in the original solution were: ${ANSWER.join(" ==> ")}`);
}

function set_message(s) {
    $(".message_area").empty().append($(`<span>${s}</span>`))
}