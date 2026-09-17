

$(document).ready(function () {
    const parameters = [
        { name: "A", long: "Offset", placeholder: "Offset" },
        { name: "B", long: "Intramolecular coupling constant", placeholder: "Unit: s-2" },
    ];

    let profileCount = 1;
    let activeTabs = 1;
    const maxTabs = 10;

    // === universal AJAX cancellation ===
    const __cancelAjax = {
        inflight: new Set(),
        register(xhr) { this.inflight.add(xhr); },
        unregister(xhr) { this.inflight.delete(xhr); },
        abortAll() {
            this.inflight.forEach(x => { try { x.abort(); } catch (_) {} });
            this.inflight.clear();
        }
    };
    $(document).ajaxSend((_e, xhr) => __cancelAjax.register(xhr));
    $(document).ajaxComplete((_e, xhr) => __cancelAjax.unregister(xhr));

    // Scope this layout for Arrhenius-only CSS overrides
    if (!document.getElementById('indieTab')) {
        $('#myTabContent').wrap('<div id="indieTab"></div>');
    }


    function formatValue(value) {
        if (typeof value === 'number' && !isNaN(value)) {
            if (Math.abs(value) >= 1e6 || Math.abs(value) < 1e-4) {
                return value.toExponential(4);
            } else {
                return value.toFixed(4);
            }
        }
        return value !== undefined && value !== null ? String(value) : "";
    }

    $('.parameter-input input[type="text"]').each(function () {
        let value = $(this).val();
        if (value !== "") {
            $(this).val(formatValue(value));
        }
    });

    function ensureAxisScaleUI(profileId) {
        const $box = $(`#axis-scale-${profileId}`);
        if (!$box.length) return;

        if ($box.data('built')) return;
        $box.data('built', true);

        const html = `
      <div class="d-flex align-items-center" style="gap: 10px;">
        <div class="d-flex align-items-center" style="gap: 6px;">
          <span>Y-Axis</span>
          <div class="form-check form-switch m-0">
            <input class="form-check-input axis-switch" type="checkbox"
                   id="yScale-${profileId}" data-axis="y">
          </div>
          <span>lin/log</span>
        </div>

        <div class="d-flex align-items-center" style="gap: 6px;">
          <span>X-Axis</span>
          <div class="form-check form-switch m-0">
            <input class="form-check-input axis-switch" type="checkbox"
                   id="xScale-${profileId}" data-axis="x" checked>
          </div>
          <span>lin/log</span>
        </div>
      </div>
    `;
        $box.html(html);

        $box.off('change.axis').on('change.axis', '.axis-switch', function () {
            const axis = $(this).data('axis');     // "x" or "y"
            const isLog = $(this).is(':checked');  // checked => log
            const plotDivId = `${profileId}-plot`;

            const update = {};
            update[`${axis}axis.type`] = isLog ? 'log' : 'linear';

            Plotly.relayout(plotDivId, update);
        });
    }

    function setAxisScaleUIVisible(profileId, visible) {
        const $box = $(`#axis-scale-${profileId}`);
        if (visible) {
            ensureAxisScaleUI(profileId);
            $box.removeClass('d-none');
        } else {
            $box.addClass('d-none');
        }
    }

    function createParameterFields(profileId) {

        const parameterContainer = $(`#${profileId}`);

        const flexContainer = `
        <div class="profile-flex">
          <div class="parameters-container" id="${profileId}-parameters" style="flex:none; min-width:0; width:auto;"></div>
          <div class="plots-container" id="${profileId}-plots-container" style="flex:1 1 0; min-width:0; overflow:hidden; visibility:hidden; box-sizing:content-box;">
          <div id="${profileId}-plot" style="height: 650px; width: 800px;"></div>
          </div>
        </div>`;

        parameterContainer.append(flexContainer);

        const accordion = `
        <div class="accordion mt-3" id="accordion-${profileId}" style="width: 100%;">
            <div class="card">
                <div class="card-header" id="heading-${profileId}">
                    <h2 class="mb-0">
                        <button class="btn btn-link btn-block text-left" type="button" data-toggle="collapse"
                                data-target="#collapse-${profileId}" aria-expanded="true"
                                aria-controls="collapse-${profileId}">
                            Input Data for ${profileId}
                        </button>
                    </h2>
                </div>
                <div id="collapse-${profileId}" class="collapse show"
                     aria-labelledby="heading-${profileId}" data-parent="#accordion-${profileId}">
                    <div class="card-body">
                        <textarea class="form-control mb-3 resizable-input narrow-input"
                                  id="textarea-${profileId}"
                                  placeholder="Enter data for ${profileId}"
                                  style="height: 100px; width: 95%;">
# TAG = Profile 1
# UNIT = MHz
<Add input here></textarea>
                    </div>
                </div>
            </div>
        </div>`;
        parameterContainer.append(accordion);

        const parametersContainer = $(`#${profileId}-parameters`);

        parametersContainer.append(emfParamRow(profileId, 'A', 'A'));
        parametersContainer.append(emfParamRow(profileId, 'B', 'B'));

        parametersContainer.append(`<div class="emf-blocks" id="${profileId}-blocks"></div>`);
        $(`#${profileId}-blocks`).append(emfBuildBlock(profileId, 1));
        parametersContainer.append(
            `<button type="button"
                     class="btn btn-sm btn-outline-secondary emf-addblock mt-2"
                     id="${profileId}-addblock">+</button>`
        );

        emfRefreshBlocks(profileId);
    }

    $(document).on("click", ".param-label-dropdown .dropdown-item", function (e) {
        e.preventDefault();
        const $item = $(this);
        const $menu = $item.closest(".param-label-dropdown");
        $menu.find(".dropdown-item").removeClass("active");
        $item.addClass("active");
        $menu.find("button").html($item.html());
    });


    $(document).on('change', '.fix-free-switch', function () {
        const isChecked = $(this).is(':checked');
        const labelElement = $(this).next('label');
        labelElement.text(isChecked ? 'Free' : 'Fix');
    });


    $(document).on('shown.bs.dropdown', '.param-label-dropdown', function () {
        $(this).closest('.parameter-input').addClass('z-top');
    });
    $(document).on('hidden.bs.dropdown', '.param-label-dropdown', function () {
        $(this).closest('.parameter-input').removeClass('z-top');
    });

    function emfDisplayRow(n) {
        return `
        <div class="parameter-input mb-3" data-param="c${n}" data-display="true">
            <div class="input-group">
                <span class="input-group-text">c<sub>${n}</sub></span>
                <input type="text" class="form-control param-error" placeholder="\u2014" readonly>
            </div>
        </div>`;
    }

    function emfParamRow(profileId, paramName, labelHTML, placeholder, minVal, maxVal, free, title) {
        const cfg = parameters.find(p => p.name === paramName) || {};
        if (placeholder === undefined) placeholder = cfg.placeholder || '';
        if (minVal      === undefined) minVal      = '';
        if (maxVal      === undefined) maxVal      = '';
        if (free        === undefined) free        = true;
        if (title       === undefined) title       = cfg.long || '';
        return `
        <div class="parameter-input mb-3" data-param="${paramName}">
            <div class="input-group">
                <span class="input-group-text">${labelHTML}</span>

                <span class="input-group-text p-0 switch-cell">
                    <div class="form-check form-switch ms-2 me-2 my-1">
                        <input class="form-check-input fix-free-switch" type="checkbox" role="switch"
                               id="switch${paramName}-${profileId}" ${free ? 'checked' : ''}>
                        <label class="form-check-label ms-2"
                               for="switch${paramName}-${profileId}">${free ? 'Free' : 'Fix'}</label>
                    </div>
                </span>

                <input type="text" class="form-control param-value"  title="${title}" placeholder="${placeholder}">
                <input type="text" class="form-control param-error"  placeholder="Error" readonly>
                <input type="text" class="form-control param-min"    placeholder="min"   value="${minVal}">
                <input type="text" class="form-control param-max"    placeholder="max"   value="${maxVal}">
            </div>
        </div>`;
    }

    function emfBuildBlock(profileId, n) {
        const tauLabel = '\u03c4<sub>' + n + '</sub>';
        const s2Label  = 'S<sup>2</sup><sub>' + (n - 1) + '</sub>';
        const bodyRows =
            (n >= 2 ? emfParamRow(profileId, 'S2' + (n - 1), s2Label, '', '0', '1') : '') +
            emfDisplayRow(n) +
            emfParamRow(profileId, 'tau' + n, tauLabel);

        return `
        <div class="emf-block" data-block="${n}">
            <div class="emf-block-head d-flex align-items-center" style="gap: 10px; margin-top: 8px;">
                <button type="button" class="btn-close emf-block-del" aria-label="Close" style="display:none;"></button>
            </div>
            <div class="emf-block-body">
                ${bodyRows}
            </div>
        </div>`;
    }

    function emfRefreshBlocks(profileId) {
        const $blocks = $(`#${profileId}-blocks .emf-block`);
        const count   = $blocks.length;
        $blocks.each(function (i) {
            const isLast  = (i === count - 1);
            const isFirst = (i === 0);
            $(this).find('> .emf-block-head .emf-block-del').toggle(isLast && !isFirst);
        });
        $(`#${profileId}-addblock`).prop('disabled', count >= 5);
    }

    function computeWeights(profileId) {
        const $blocks = $(`#${profileId}-blocks .emf-block`);
        const N = $blocks.length;

        const S = [];
        $blocks.each(function (i) {
            if (i === 0) return; // block 1 has no S2
            const val = parseFloat(
                $(this).find(`.parameter-input[data-param="S2${i}"] .param-value`).val()
            );
            S.push(isNaN(val) ? NaN : val);
        });
        const c = [];
        if (N === 1) {
            c.push(1);
        } else {
            for (let k = 0; k < N; k++) {
                let prod = 1;
                for (let j = 0; j < k; j++) prod *= (1 - S[j]);
                const ck = (k < N - 1) ? S[k] * prod : prod;
                c.push(ck);
            }
        }

        $blocks.each(function (i) {
            const $field = $(this).find(`.parameter-input[data-param="c${i + 1}"] .param-error`);
            const val = c[i];
            if ($field.length) {
                $field.val(isNaN(val) ? '—' : formatValue(val));
            }
        });
    }

    $(document).on('input', '.emf-block .parameter-input[data-param^="S2"] .param-value', function () {
        computeWeights($(this).closest('.tab-pane').attr('id'));
    });

    $(document).on('click', '.emf-block-del', function () {
        const pid     = $(this).closest('.tab-pane').attr('id');
        const $blocks = $(`#${pid}-blocks .emf-block`);
        if ($blocks.length > 1) { $blocks.last().remove(); emfRefreshBlocks(pid); }
    });

    $(document).on('click', '.emf-addblock', function () {
        const pid   = $(this).closest('.tab-pane').attr('id');
        const $bc   = $(`#${pid}-blocks`);
        const count = $bc.children('.emf-block').length;
        if (count >= 5) return;

        $bc.append(emfBuildBlock(pid, count + 1));
        emfRefreshBlocks(pid);
    });


    createParameterFields('profile1');


    function saveParameterExtModelfree() {
        const saveRequests = [];

        $('.tab-pane').each(function () {
            const profileId  = $(this).attr('id');
            const profileNum = profileId.replace('profile', '');
            const data = {};

            data["ProfileName"] = $(`#${profileId}-name`).text().trim();

            // Count active blocks (determines N-case in Java)
            const N = $(`#${profileId}-blocks .emf-block`).length;
            data["N"] = N;

            let index = 0;
            $(`#${profileId} .parameter-input`).each(function () {
                const $row = $(this);
                if ($row.attr('data-display') === 'true') return; // c_n — skip

                const rawVal = $row.find('.param-value').val() || '';
                const rawMin = $row.find('.param-min').val()   || '';
                const rawMax = $row.find('.param-max').val()   || '';

                const value    = rawVal === '' ? '' : parseFloat(rawVal);
                const minValue = rawMin === '' ? '' : parseFloat(rawMin);
                const maxValue = rawMax === '' ? '' : parseFloat(rawMax);

                const fixFree = $row.find('.fix-free-switch').is(':checked') ? 'Free' : 'Fix';

                data[`F${index}`]    = fixFree;
                data[`Pval${index}`] = value;
                data[`Pmin${index}`] = minValue;
                data[`Pmax${index}`] = maxValue;

                index++;
            });

            let rawInput = ($(`#textarea-${profileId}`).val() || '').toString();
            const lns = rawInput.split(/\r?\n/);
            const injected = [];
            for (const ln of lns) {
                if (ln.trim().startsWith('# TAG')) injected.push('# DATA N = 1');
                injected.push(ln);
            }
            rawInput = injected.join('\n');

            const lines = rawInput.split(/\r?\n/);
            let unitFactor = 1;
            const unitLine = lines.find(l => l.trim().toUpperCase().startsWith('# UNIT ='));
            if (unitLine) {
                const unitTxt = unitLine.split('=')[1].trim().toUpperCase();
                if (unitTxt === 'MHZ') unitFactor = 1e6;
            }

            const processedLines = lines.map(line => {
                if (line.trim().startsWith('#') || line.trim() === '') return line;
                const parts = line.trim().split(/\s+/);
                if (!isNaN(parseFloat(parts[0]))) parts[0] = (parseFloat(parts[0]) * unitFactor).toString();
                if (parts.length === 2) {
                    const y = parseFloat(parts[1]);
                    if (!isNaN(y)) parts.push(Number((0.1 * y).toPrecision(6)).toString());
                }
                return parts.join('    ');
            });
            data["Dados"] = processedLines.join('\n');

            // Tags + SelectedDataSet
            const tagValue = $(`#${profileId}-name`).text().trim();
            data["Tags"]           = tagValue ? [tagValue] : [];
            data["SelectedDataSet"] = tagValue;

            saveRequests.push($.ajax({
                type: 'POST',
                url: '/saveTabData_modelfree',
                data: JSON.stringify(data),
                contentType: 'application/json'
            }));
        });

        return Promise.all(saveRequests);
    }

    function saveForPlot() {
        let saveRequests = [];
        let tabIndex = 1;

        $('.tab-pane').each(function () {
            const profileId = $(this).attr('id');
            const data = {};

            data["ProfileName"]  = $(`#${profileId}-name`).text().trim();
            data["Mode"]         = "plot";
            data["ProfileIndex"] = tabIndex; // lets Java dummy generator know which dataset index to use

            // ===== Dados =====
            let rawInput = ($(`#textarea-${profileId}`).val() || "").toString();
            const trimmed = rawInput.trim();

            // If user didn't provide real data, trigger Java dummy generator (MUST be exact)
            if (trimmed === "" || trimmed.includes("<Add input here>")) {
                data["Dados"] = "<Add input here>";
            } else {

                // === INTERNAL inject: always add "# DATA N = 1" before every "# TAG" ===
                function injectDataN(text) {
                    const lns = text.split(/\r?\n/);
                    const out = [];
                    for (const ln of lns) {
                        if (ln.trim().startsWith("# TAG")) {
                            out.push("# DATA N = 1");
                        }
                        out.push(ln);
                    }
                    return out.join("\n");
                }

                rawInput = injectDataN(rawInput);
                const lines = rawInput.split(/\r?\n/);

                // detect unit factor from # UNIT =
                let unitFactor = 1;
                const unitLine = lines.find(line => line.trim().toUpperCase().startsWith("# UNIT ="));
                if (unitLine) {
                    const unitTxt = unitLine.split("=")[1].trim().toUpperCase();
                    if (unitTxt === "MHZ") unitFactor = 1e6;
                    else if (unitTxt === "HZ") unitFactor = 1;
                }

                const processedLines = lines.map(line => {
                    const t = line.trim();

                    // keep comments and blank lines as-is
                    if (t.startsWith("#") || t === "") return line;

                    // defensive: never reformat the placeholder if it appears
                    if (t === "<Add input here>") return "<Add input here>";

                    // numeric conversion (first column) + normalize spacing
                    const parts = t.split(/\s+/);
                    if (!isNaN(parseFloat(parts[0]))) {
                        parts[0] = (parseFloat(parts[0]) * unitFactor).toString();
                    }
                    if (parts.length === 2) {
                        const y = parseFloat(parts[1]);
                        if (!isNaN(y)) {
                            parts.push(Number((0.1 * y).toPrecision(6)).toString());
                        }
                    }
                    return parts.join("    ");
                });

                data["Dados"] = processedLines.join("\n");
            }





            const saveRequest = $.ajax({
                type: 'POST',
                url: `/saveTabData/indie_profile${tabIndex}`,
                data: JSON.stringify(data),
                contentType: 'application/json'
            });

            saveRequests.push(saveRequest);
            tabIndex++;
        });

        return Promise.all(saveRequests);
    }



    function findLatestJsonFile(activeTabId, mode = "fit") {
        const profileNumber = activeTabId.replace('profile', ''); // Extract profile number
        console.log(`Finding latest JSON file for Profile ${profileNumber}...`);

        $.ajax({
            url: `/files/list`,
            method: 'GET',
            dataType: 'json',
            cache: false,
            success: function (files) {
                const matchingFiles = files.filter(file => file.match(`\\d{8}_\\d{4}_modelfree\.json$$`));

                if (matchingFiles.length === 0) {
                    alert("No JSON file found for this profile.");
                    console.warn(`No matching JSON files found for Profile ${profileNumber}.`);
                    return;
                }

                matchingFiles.sort().reverse();
                const latestFile = matchingFiles[0];

                console.log(`Latest JSON file for Profile ${profileNumber}: ${latestFile}`);
                fetchDataAndPlot(latestFile, activeTabId, mode);
            },
            error: function (xhr, status, error) {
                alert("Error retrieving JSON file list.");
                console.error("Fetch error:", status, error);
            }
        });
    }

    function fetchDataAndPlot(jsonFileName, activeTabId, mode = "fit") {
        console.log(`Fetching JSON file: ${jsonFileName}`);

        const url = `/files/${jsonFileName}?timestamp=${new Date().getTime()}`;

        $.ajax({
            url: url,
            method: 'GET',
            dataType: 'json',
            cache: false,
            success: function (data) {
                if (data && data["Dados"]) {
                    const datasets = parseData(data["Dados"]);
                    const fitCurvesData = data["fit-curves"]
                        ? parseFitCurvesEMF(data["fit-curves"])
                        : null;

                    plotNewData(datasets, fitCurvesData, activeTabId, mode);
                } else {
                    alert("No 'Dados' found in the JSON.");
                    console.warn("Received JSON but 'Dados' is missing:", data);
                }
            },
            error: function (xhr, status, error) {
                alert("Error fetching data. Ensure the filename is correct.");
                console.error("Fetch error:", status, error);
            }
        });
    }

    function plotNewData(datasets, fitCurvesData, activeTabId, mode = "fit") {
        const traces = [];
        const CONTRIB_COLORS = ['#e41a1c','#377eb8','#4daf4a','#32452c','#32452cff'];
        const CONTRIB_DASHES = ['dash','dot','dashdot','longdash','dot'];

        if (datasets && datasets.data && datasets.data.length) {
            traces.push({
                x: datasets.data.map(p => p.x),
                y: datasets.data.map(p => p.y),
                mode: 'markers',
                type: 'scatter',
                name: 'Data',
                visible: (mode === "plot") ? 'legendonly' : true
            });
        }

        if (fitCurvesData && fitCurvesData.total && fitCurvesData.total.length) {
            if (mode === "compare") {
                // C-mode: show individual contributions + total
                fitCurvesData.contributions.forEach(function (contrib, i) {
                    traces.push({
                        x: contrib.map(p => p.x),
                        y: contrib.map(p => p.y),
                        mode: 'lines',
                        type: 'scatter',
                        name: 'Contribution ' + (i + 1),
                        line: { dash: CONTRIB_DASHES[i] || 'dot', color: CONTRIB_COLORS[i], width: 1.5 }
                    });
                });
            }
            // Always add total
            traces.push({
                x: fitCurvesData.total.map(p => p.x),
                y: fitCurvesData.total.map(p => p.y),
                mode: 'lines',
                type: 'scatter',
                name: 'Fit Curve',
                line: { dash: 'solid', width: 2 }
            });
        }

        const layout = {
            title: { text: 'NMRD Profile and Fit' },
            xaxis: { title: { text: 'Larmor Frequency [Hz]' }, type: 'log', autorange: true, tickformat: '.0e' },
            yaxis: { title: { text: 'Relaxation rate [1/s]' }, autorange: true }
        };

        Plotly.react(`${activeTabId}-plot`, traces, layout);
    }


    function parseData(dataString) {
        const lines = dataString.replace(/\\n/g, '\n').trim().split("\n");
        const dataset = { data: [] };

        for (const raw of lines) {
            const line = raw.trim();
            if (!line || line.startsWith('#')) continue;

            const parts = line.split(/\s+/);
            const x = parseFloat(parts[0]);
            const y = parseFloat(parts[1]); // ALWAYS the 2nd column for experimental y

            if (!Number.isNaN(x) && !Number.isNaN(y)) {
                dataset.data.push({ x, y });
            }
        }
        return dataset;
    }



    function parseFitCurvesEMF(fitCurvesArray) {
        const contributions = [];
        const total = [];

        fitCurvesArray.forEach(dataString => {
            const lines = dataString.replace(/\\n/g, '\n').trim().split('\n');
            lines.forEach(line => {
                const t = line.trim();
                if (!t || t.startsWith('#')) return;
                const parts = t.split(/\s+/).map(Number).filter(n => !isNaN(n));
                if (parts.length < 3) return;
                const x = parts[0];
                const nContribs = parts.length - 2;
                for (let i = 0; i < nContribs; i++) {
                    if (!contributions[i]) contributions[i] = [];
                    contributions[i].push({ x, y: parts[i + 1] });
                }
                total.push({ x, y: parts[parts.length - 1] });
            });
        });

        return { contributions, total };
    }



    $('#submit-button').on('click', saveParameterExtModelfree);
//     $('#submit-button').on('click', saveForPlot);

    function applyModelfreeFromJson(profileId, data) {
        const parTable = Array.isArray(data['par-tables']) && Array.isArray(data['par-tables'][0])
            ? data['par-tables'][0] : null;

        if (parTable) {
            let tableIdx = 0;
            $(`#${profileId} .parameter-input`).each(function () {
                const $row = $(this);
                if ($row.attr('data-display') === 'true') return; // c_n — skip

                const entry = parTable[tableIdx];
                if (!entry) return;

                const val = entry.value;
                const err = entry.err;
                const min = entry.min;
                const max = entry.max;

                $row.find('.param-value').val(val !== undefined && val !== '' ? formatValue(val) : '');
                $row.find('.param-min').val(min !== undefined && min !== '' ? formatValue(min) : '');
                $row.find('.param-max').val(max !== undefined && max !== '' ? formatValue(max) : '');

                // Error field
                const errStr = String(err ?? '').trim().toLowerCase();
                if (errStr === '' || errStr === 'fixed' || errStr === 'constant') {
                    $row.find('.param-error').val('');
                } else {
                    const errNum = Number(err);
                    $row.find('.param-error').val(Number.isFinite(errNum) ? formatValue(errNum) : '');
                }

                tableIdx++;
            });
        }

        // Recalculate c_n weights
        computeWeights(profileId);


        // R² / chi² quality box
        const fitResults = data && data['fit-results'];
        if (typeof fitResults === 'string') {
            const lines = fitResults.trim().split(/\r?\n/);
            if (lines.length >= 2) {
                const tokens = lines[1].split(',').map(s => s.trim());
                const R2   = tokens[2];
                const chi2 = tokens[3];
                const $box = $(`#fit-quality-${profileId}`);
                $box.html(`
                    <table class="table table-sm table-borderless mb-0">
                        <tr>
                            <td class="label">χ²</td><td>${formatValue(Number(chi2))}</td>
                            <td class="label">R²</td><td>${formatValue(Number(R2))}</td>
                        </tr>
                    </table>`).removeClass('d-none');
            }
        }
    }

    $(document).ready(function () {

        function setSpinnerVisible(on) {
            const $ov = $('#fit-spinner-overlay');
            if (on) $ov.removeClass('d-none').addClass('d-flex');
            else    $ov.removeClass('d-flex').addClass('d-none');
        }
        function setFitUiDisabled(disabled) {
            $('#fit-button, #plot-button, #switch-plot, #close-plot').prop('disabled', disabled);
        }

        $('#fit-button').off('click').on('click', function () {
            console.log("Saving data before fitting.");
            setFitUiDisabled(true);
            setSpinnerVisible(true);

            // Save → Fit → Update UI
            saveParameterExtModelfree()
                .then(() => {
                    console.log("Saving complete. Starting fit process...");
                    return $.ajax({ url: '/fit_modelfree', method: 'POST' });
                })
                .then(() => {
                    findLatestJsonFile('profile1', 'fit');
                    $.ajax({
                        url: '/files/list',
                        method: 'GET',
                        dataType: 'json',
                        cache: false,
                        success: function (files) {
                            const matching = files
                                .filter(f => f.match(/\d{8}_\d{4}_modelfree\.json$/))
                                .sort().reverse();
                            if (!matching.length) return;
                            $.ajax({
                                url: `/files/${matching[0]}?timestamp=${new Date().getTime()}`,
                                method: 'GET',
                                dataType: 'json',
                                cache: false,
                                success: function (data) {
                                    applyModelfreeFromJson('profile1', data);
                                    $(`#profile1-plots-container`).css('visibility', 'visible');
                                    setAxisScaleUIVisible('profile1', true);
                                    const fitCurvesData = data["fit-curves"]
                                        ? parseFitCurvesEMF(data["fit-curves"])
                                        : null;
                                    window.__emfFitCurvesCache = fitCurvesData;
                                    const datasets = parseData(data["Dados"] || "");
                                    plotNewData(datasets, fitCurvesData, 'profile1', 'fit');
                                }
                            });
                        }
                    });
                })
                .catch((err) => {
                    if (err && (err.statusText === 'abort' || err === 'abort')) {
                        console.log('Fit aborted by user');
                        return;
                    }
                    const msg = (err && (err.responseText || err.statusText)) ? String(err.responseText || err.statusText) : 'Unknown error';
                    console.error('Indie error:', err);
                    console.log('Fit failed:', msg);
                })
                .finally(() => {
                    setSpinnerVisible(false);
                    setFitUiDisabled(false);
                });
        });


        $('#close-plot').on('click', function () {
            const activeTabId = $('#myTabContent .tab-pane.active').attr('id'); // Get active tab
            Plotly.purge(`${activeTabId}-plot`);
            $(`#${activeTabId}-plots-container`).css('visibility', 'hidden');
            console.log(`Plot for ${activeTabId} has been cleared and hidden.`);
            setAxisScaleUIVisible(activeTabId, false);

        });

        $('#switch-plot').show().prop('disabled', false);

        (function () {
            let isCompareMode = false;

            $('#switch-plot').off('click').on('click', function () {
                const activeTabId = $('#myTabContent .tab-pane.active').attr('id');
                const plotContainer = $(`#${activeTabId}-plots-container`);

                isCompareMode = !isCompareMode;

                plotContainer.css('visibility', 'visible');
                setAxisScaleUIVisible(activeTabId, true);

                if (isCompareMode) {
                    findLatestJsonFile(activeTabId, "compare");
                } else {
                    findLatestJsonFile(activeTabId, "fit");
                }
            });
        })();

        $('#plot-button').on('click', function () {
            setFitUiDisabled(true);
            setSpinnerVisible(true);

            saveParameterExtModelfree()
                .then(() => $.ajax({ url: '/fit_modelfree', method: 'POST' }))
                .then(() => {
                    $.ajax({
                        url: '/files/list',
                        method: 'GET',
                        dataType: 'json',
                        cache: false,
                        success: function (files) {
                            const matching = files
                                .filter(f => f.match(/\d{8}_\d{4}_modelfree_indie\.json$/))
                                .sort().reverse();
                            if (!matching.length) return;
                            $.ajax({
                                url: `/files/${matching[0]}?timestamp=${new Date().getTime()}`,
                                method: 'GET',
                                dataType: 'json',
                                cache: false,
                                success: function (data) {
                                    applyModelfreeFromJson('profile1', data);
                                    $(`#profile1-plots-container`).css('visibility', 'visible');
                                    setAxisScaleUIVisible('profile1', true);
                                    const fitCurvesData = data["fit-curves"]
                                        ? parseFitCurvesEMF(data["fit-curves"])
                                        : null;
                                    window.__emfFitCurvesCache = fitCurvesData;
                                    const datasets = parseData(data["Dados"] || "");
                                    plotNewData(datasets, fitCurvesData, 'profile1', 'plot');
                                }
                            });
                        }
                    });
                })
                .finally(() => {
                    setSpinnerVisible(false);
                    setFitUiDisabled(false);
                });
        });

        $('#cancel-fit-button').off('click').on('click', function () {
            __cancelAjax.abortAll();

            $.ajax({ url: '/fit_cancel', method: 'POST' });

            $('#fit-spinner-overlay').addClass('d-none').removeClass('d-flex');
            $('#fit-button, #plot-button, #switch-plot, #close-plot').prop('disabled', false);

            console.log('[CANCEL] universal abort triggered');
        });


        // ── Export helpers ─────────────────────────────────────────────────────────
        function pad2(n) { return String(n).padStart(2, '0'); }

        function makeTimestamp() {
            const d = new Date();
            return pad2(d.getHours()) + pad2(d.getMinutes()) +
                pad2(d.getDate())  + pad2(d.getMonth()+1) +
                pad2(d.getFullYear() % 100);
        }

        function sanitize(name) {
            return String(name).trim().replace(/\s+/g, '').replace(/[^\w-]/g, '');
        }

        function csvCell(x) {
            const s = (x === null || x === undefined) ? '' : String(x);
            if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
            return s;
        }

        function rowToCsv(cells) { return cells.map(csvCell).join(','); }

        function downloadBlob(blob, filename) {
            const a = document.createElement('a');
            const url = URL.createObjectURL(blob);
            a.href = url; a.download = filename;
            document.body.appendChild(a); a.click();
            document.body.removeChild(a); URL.revokeObjectURL(url);
        }

        function getActiveProfileId() {
            return $('#myTabContent .tab-pane.active').attr('id') || 'profile1';
        }

        function getActiveProfileName(profileId) {
            return sanitize($(`#${profileId}-name`).text() || profileId || 'profile1');
        }

        function getFitQuality(profileId) {
            const $box = $(`#fit-quality-${profileId}`);
            if (!$box.length) return { chi2: '', R2: '' };
            const tds = $box.find('td');
            return {
                chi2: tds.length >= 4 ? $(tds[1]).text().trim() : '',
                R2:   tds.length >= 4 ? $(tds[3]).text().trim() : ''
            };
        }

        function getDataInputXYZ(profileId) {
            const raw = $(`#textarea-${profileId}`).val() || '';
            const x = [], y = [], yerr = [];
            for (const rawLine of raw.replace(/\r/g, '').split('\n')) {
                const line = rawLine.split('#')[0].trim();
                if (!line) continue;
                const parts = line.split(/\s+/);
                if (parts.length < 2) continue;
                const xv = parseFloat(parts[0]);
                const yv = parseFloat(parts[1]);
                const ev = parts.length >= 3 ? parseFloat(parts[2]) : NaN;
                if (!isNaN(xv) && !isNaN(yv)) {
                    x.push(xv); y.push(yv);
                    yerr.push(isNaN(ev) ? '' : ev);
                }
            }
            return { x, y, yerr };
        }


        function getEMFFitCurves() {
            const cached = window.__emfFitCurvesCache;
            if (!cached) return { x: [], total: [], contributions: [] };
            return {
                x:             cached.total.map(p => p.x),
                total:         cached.total.map(p => p.y),
                contributions: cached.contributions.map(c => c.map(p => p.y))
            };
        }

        // ── EMF export ─────────────────────────────────────────────────────────────
        // Columns:
        //   A  Parameter
        //   B  Fix/Free
        //   C  Value
        //   D  Error
        //   E  chi2  (row 1 only)
        //   F  R2    (row 1 only)
        //   G-H fillers
        //   I  fit_x
        //   J  fit_total
        //   K+ fit_contrib1 .. fit_contribN  (dynamic)
        //   .. fillers
        //   R  data_x
        //   S  data_y
        //   T  data_y_err
        function exportEMFCsv() {
            const profileId = getActiveProfileId();
            const fit = getEMFFitCurves();
            if (!fit.x.length) {
                alert('Export error: no plot data available. Run a fit first.');
                return;
            }

            const ts = makeTimestamp();
            const filename = `${ts}_modelfree.csv`;

            // Collect parameter rows — include c_n (display) and fittable rows
            const paramRows = [];
            $(`#${profileId} .parameter-input`).each(function () {
                const $row = $(this);
                const param = String($row.data('param') || '').trim();
                if (!param) return;

                const isDisplay = $row.attr('data-display') === 'true';
                const value    = isDisplay
                    ? ($row.find('.param-error').val() || '')
                    : ($row.find('.param-value').val() || '');
                const errorRaw = isDisplay ? '' : ($row.find('.param-error').val() || '');
                const error    = isDisplay ? '' : (errorRaw.trim() === '' ? 'na' : errorRaw);
                const fixfree  = isDisplay ? '' : ($row.find('.fix-free-switch').is(':checked') ? 'Free' : 'Fix');

                paramRows.push({ param, fixfree, value, error });
            });

            const { chi2, R2 } = getFitQuality(profileId);
            const dataIn = getDataInputXYZ(profileId);
            const nContribs = fit.contributions.length;

            // Build header
            const contribHeaders = Array.from({ length: nContribs }, (_, i) => `fit_contrib${i + 1}`);
            const header = [
                'Parameter', 'Fix/Free', 'Value', 'Error', 'chi2', 'R2',
                '', '',
                'fit_x', 'fit_total', ...contribHeaders,
                '', '',
                'data_x', 'data_y', 'data_y_err'
            ];

            const maxLen = Math.max(paramRows.length, fit.x.length, dataIn.x.length);
            const lines = [rowToCsv(header)];

            for (let i = 0; i < maxLen; i++) {
                const p   = paramRows[i] || {};
                const fx  = i < fit.x.length     ? fit.x[i]     : '';
                const fy  = i < fit.total.length  ? fit.total[i] : '';
                const fc  = contribHeaders.map((_, ci) =>
                    i < (fit.contributions[ci] || []).length ? fit.contributions[ci][i] : '');
                const dx  = i < dataIn.x.length    ? dataIn.x[i]    : '';
                const dy  = i < dataIn.y.length     ? dataIn.y[i]    : '';
                const de  = i < dataIn.yerr.length  ? dataIn.yerr[i] : '';

                lines.push(rowToCsv([
                    p.param   || '', p.fixfree || '', p.value || '', p.error || '',
                    i === 0 ? (chi2 || '') : '',
                    i === 0 ? (R2   || '') : '',
                    '', '',
                    fx, fy, ...fc,
                    '', '',
                    dx, dy, de
                ]));
            }

            const blob = new Blob([lines.join('\n') + '\n'], { type: 'text/csv;charset=utf-8' });
            downloadBlob(blob, filename);
        }

        $(document)
            .off('click.exportCsvEMF', '#export-button')
            .on('click.exportCsvEMF', '#export-button', function (e) {
                e.preventDefault();
                e.stopPropagation();
                exportEMFCsv();
            });



    });


});

$('[data-toggle="tooltip"]').tooltip();

$('#container-width').on('input', function () {
    let newWidth = $(this).val() + 'px';
    $('.container').css('width' +
        '' +
        '' +
        '', newWidth);
});

// Toasts for notifications
$('#maxTabsToast').toast({ delay: 2000 });
$('#lastTabToast').toast({ delay: 2000 });



