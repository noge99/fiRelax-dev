const angstrom = 10000000000;
const Aoh_conv = 2 * Math.PI * 1000000;

$(document).ready(function () {
    const parameters = [
        { name: "q", long: "number of coordinated H2O", placeholder: "nb. of H2O. q > 0" },
        { name: "C", long: "concentration of particles m", placeholder: "Unit: mmol/L" },
        { name: "ms", long: "molar mass of the solvent", placeholder: "Unit: water: 0.01801528 kg/mol" },
        { name: "rho", long: "density of the solution", placeholder: "Unit: water: 1 kg/L" },
        { name: "S", long: "electronic spin", placeholder: "Electronic spin. Unit: Gd(III): 3.5, Mn(II): 2.5" },
        { name: "tm", long: "Lifetime of the water molecule in contact", placeholder: "Unit: s" },
        { name: "tR", long: "Rotational correlation time of the m-q*water aggregate", placeholder: "Unit: s" },
        { name: "tv", long: "Electron relaxation correlation time", placeholder: "Unit: s" },
        { name: "r", long: "Proton-Metal Distance", placeholder: "Unit: m or Å" },
        { name: "Delta2", long: "Transient ZFS", placeholder: "Unit: s-2 or cm-1" },
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
                return value.toExponential(4); // Convert large/small numbers to scientific notation
            } else {
                return value.toFixed(4); // Keep normal numbers readable
            }
        }
        return value !== undefined && value !== null ? String(value) : "";
    }

    $('.parameter-input input[type="text"]').each(function () {
        let value = $(this).val();
        if (value !== "") {
            $(this).val(formatValue(value)); // Format value in scientific notation if needed
        }
    });

    function ensureAxisScaleUI(profileId) {
        const $box = $(`#axis-scale-${profileId}`);
        if (!$box.length) return;

        if ($box.data('built')) return;
        $box.data('built', true);

        // Defaults: Y linear (unchecked), X log (checked)
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
        ensureAxisScaleUI(profileId);
        const $box = $(`#axis-scale-${profileId}`);
        if (!$box.length) return;

        if (visible) $box.removeClass('d-none');
        else $box.addClass('d-none');
    }

    function updateFitQualityFromFitResults(profileId, data) {
        const fitResults = data && data["fit-results"];
        if (typeof fitResults !== "string") return;

        const lines = fitResults.trim().split(/\r?\n/);
        if (lines.length < 2) return;

        const tokens = lines[1].split(",").map(s => s.trim());

        // IMPORTANT: Always 3rd (R²) and 4th (chi2) token of second row
        const R2   = tokens[2];
        const chi2 = tokens[3];

        const $box = $(`#fit-quality-${profileId}`);
        if (!$box.length) return;

        const tableHTML = `
        <table class="table table-sm table-borderless mb-0">
            <tr>
                <td class="label">χ²</td>
                <td>${formatValue(Number(chi2))}</td>
                <td class="label">R²</td>
                <td>${formatValue(Number(R2))}</td>
            </tr>
        </table>
    `;

        $box.html(tableHTML).removeClass("d-none");
    }


    function createParameterFields(profileId) {

        const parameterContainer = $(`#${profileId}`);

        const flexContainer = `
        <div class="profile-flex">
          <div class="parameters-container" id="${profileId}-parameters" style="width: 50%;"></div>
          <div class="plots-container" id="${profileId}-plots-container" style="width: 50%; visibility: hidden;">
            <div id="${profileId}-plot" style="height: 650px; width: 800px;"></div>
          </div>
        </div>`;

        parameterContainer.append(flexContainer);

        // ACCORDION (unchanged exactly as required)
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

        // MAIN PARAMETERS --------------------------------------------------------
        const parametersContainer = $(`#${profileId}-parameters`);

        parameters.forEach((param, index) => {

            const minDefault =
                param.name === 'tm' ? 1e-11 :
                    param.name === 'tv' ? 1e-12 :
                        param.name === 'tR' ? 1e-12 : '';

            const maxDefault =
                param.name === 'tm' ? 1e-6 :
                    param.name === 'tv' ? 1e-7 :
                        param.name === 'tR' ? 1e-7 : '';

            const valueDefault =
                param.name === 'q' ? 1 :
                    param.name === 'C' ? 1 :
                        param.name === 'rho' ? 1 :
                            param.name === 'ms' ? 0.018 :
                                param.name === 'S' ? 3.5 :
                                    param.name === 'tm' ? 1e-8 :
                                        param.name === 'tR' ? 1e-10 :
                                            param.name === 'tv' ? 1e-11 :
                                                param.name === 'r' ? 3 :
                                                    param.name === 'Delta2' ? 0.03 : '';

            let labelHTML;

            if (param.name === "r") {
                labelHTML = `
                <div class="input-group-text dropdown param-label-dropdown">
                    <button class="btn btn-sm btn-light dropdown-toggle" type="button" data-bs-toggle="dropdown">
                        r [Å]
                    </button>
                    <ul class="dropdown-menu">
                        <li><a class="dropdown-item active" data-unit="A">r [Å]</a></li>
                        <li><a class="dropdown-item" data-unit="m">r [m]</a></li>
                    </ul>
                </div>`;
            }
            else if (param.name === "Delta2") {
                labelHTML = `
                <div class="input-group-text dropdown param-label-dropdown">
                    <button class="btn btn-sm btn-light dropdown-toggle" type="button" data-bs-toggle="dropdown">
                        Δ<sub>t</sub> [cm<sup>-1</sup>]
                    </button>
                    <ul class="dropdown-menu">
                        <li><a class="dropdown-item active" data-unit="cm-1">Δ<sub>t</sub> [cm<sup>-1</sup>]</a></li>
                        <li><a class="dropdown-item" data-unit="s-2">Δ<sup>2</sup> [s<sup>-2</sup>]</a></li>
                    </ul>
                </div>`;
            }
            else {
                labelHTML = `<span class="input-group-text">${param.name}</span>`;
            }

            const row = `
            <div class="parameter-input mb-3" data-param="${param.name}">
                <div class="input-group">
                    ${labelHTML}

                    <span class="input-group-text p-0 switch-cell">
                        <div class="form-check form-switch ms-2 me-2 my-1">
                            <input class="form-check-input fix-free-switch" type="checkbox" role="switch"
                                   id="switch${profileId}-${index}"
                                   ${["q","C","rho","ms","S"].includes(param.name) ? "" : "checked"}>
                            <label class="form-check-label ms-2" for="switch${profileId}-${index}">
                                ${["q","C","rho","ms","S"].includes(param.name) ? "Fix" : "Free"}
                            </label>
                        </div>
                    </span>

                    <input type="text" class="form-control param-value"
                           placeholder="${param.long}" title="${param.placeholder}"
                           value="${valueDefault}">

                    <input type="text" class="form-control param-error" placeholder="Error" readonly>

                    <input type="text" class="form-control param-min" placeholder="min" value="${minDefault}">
                    <input type="text" class="form-control param-max" placeholder="max" value="${maxDefault}">
                </div>

                <select class="form-select ms-2 narrow-select copy-${param.name}-select"
                        data-param="${param.name}" data-profile="${profileId}">
                    <option value="indie">indie</option>
                </select>
            </div>`;

            parametersContainer.append(row);
        });

        // ---- FERMI SECTION -----------------------------------------------------

        const fermiCheckboxHTML = `
        <div class="form-check mt-3">
            <input type="checkbox" class="form-check-input" id="fermiContactTermCheckbox-${profileId}">
            <label class="form-check-label" for="fermiContactTermCheckbox-${profileId}">Fermi Contact Term</label>
        </div>
        <div id="dynamicParametersContainer-${profileId}"></div>`;
        parametersContainer.append(fermiCheckboxHTML);

        $(`#fermiContactTermCheckbox-${profileId}`).on('change', function () {
            const container = $(`#dynamicParametersContainer-${profileId}`);
            if (!this.checked) {
                container.empty();
                return;
            }

            const html = `
            <div class="parameter-input mb-3" data-param="Aoh">
                <div class="input-group">
                    <span class="input-group-text">Aoh</span>

                    <span class="input-group-text p-0 switch-cell">
                        <div class="form-check form-switch ms-2 me-2 my-1">
                            <input class="form-check-input fix-free-switch" type="checkbox" role="switch"
                                   id="switchAoh-${profileId}" checked>
                            <label class="form-check-label ms-2" for="switchAoh-${profileId}">Free</label>
                        </div>
                    </span>

                    <input type="text" class="form-control param-value" title="Hyperfine coupling constant. Unit: MHz" placeholder="Hyperfine coupling constant">
                    <input type="text" class="form-control param-error" readonly placeholder="Error">
                    <input type="text" class="form-control param-min" placeholder="min">
                    <input type="text" class="form-control param-max" placeholder="max">
                </div>

                <select class="form-select ms-2 narrow-select copy-Aoh-select"
                        data-param="Aoh" data-profile="${profileId}">
                    <option value="indie">indie</option>
                </select>
            </div>`;
            container.html(html);
            updateSelectOptions();
        });

        const secondSphereHTML = `
        <div class="form-check mt-3">
            <input type="checkbox" class="form-check-input" id="secondSphereCheckbox-${profileId}">
            <label class="form-check-label" for="secondSphereCheckbox-${profileId}">Second sphere</label>
        </div>
        <div id="secondSphereParametersContainer-${profileId}"></div>`;
        parametersContainer.append(secondSphereHTML);

        $(`#secondSphereCheckbox-${profileId}`).on('change', function () {
            const container = $(`#secondSphereParametersContainer-${profileId}`);
            if (!this.checked) {
                container.empty();
                return;
            }

            container.html(`

            <div class="parameter-input mb-3" data-param="q2">
                <div class="input-group">
                    <span class="input-group-text">q</span>

                    <span class="input-group-text p-0 switch-cell">
                        <div class="form-check form-switch ms-2 me-2 my-1">
                            <input class="form-check-input fix-free-switch" type="checkbox" role="switch"
                                   id="switchQ2-${profileId}">
                            <label class="form-check-label ms-2" for="switchQ2-${profileId}">Fix</label>
                        </div>
                    </span>

                    <input type="text" class="form-control param-value" title="number of coordinated H2O (second sphere). q > 0" placeholder="nb. of H2O (second sphere)" value="1">
                    <input type="text" class="form-control param-error" readonly placeholder="Error">
                    <input type="text" class="form-control param-min" placeholder="min">
                    <input type="text" class="form-control param-max" placeholder="max">
                </div>

                <select class="form-select ms-2 narrow-select copy-q2-select"
                        data-param="q2" data-profile="${profileId}">
                    <option value="indie">indie</option>
                </select>
            </div>

            <div class="parameter-input mb-3" data-param="tm2">
                <div class="input-group">
                    <span class="input-group-text">t<sub>m</sub></span>

                    <span class="input-group-text p-0 switch-cell">
                        <div class="form-check form-switch ms-2 me-2 my-1">
                            <input class="form-check-input fix-free-switch" type="checkbox" role="switch"
                                   id="switchTm2-${profileId}" checked>
                            <label class="form-check-label ms-2" for="switchTm2-${profileId}">Free</label>
                        </div>
                    </span>

                    <input type="text" class="form-control param-value" title="Lifetime of the water molecule in contact (second sphere). Unit: s" placeholder="Lifetime of the water molecule in contact" value="1e-8">
                    <input type="text" class="form-control param-error" readonly placeholder="Error">
                    <input type="text" class="form-control param-min" placeholder="min" value="1e-11">
                    <input type="text" class="form-control param-max" placeholder="max" value="1e-6">
                </div>

                <select class="form-select ms-2 narrow-select copy-tm2-select"
                        data-param="tm2" data-profile="${profileId}">
                    <option value="indie">indie</option>
                </select>
            </div>

            <div class="parameter-input mb-3" data-param="r2">
                <div class="input-group">

                    <div class="input-group-text dropdown param-label-dropdown">
                        <button class="btn btn-sm btn-light dropdown-toggle" type="button" data-bs-toggle="dropdown">
                            r [Å]
                        </button>
                        <ul class="dropdown-menu">
                            <li><a class="dropdown-item active" data-unit="A">r [Å]</a></li>
                            <li><a class="dropdown-item" data-unit="m">r [m]</a></li>
                        </ul>
                    </div>

                    <span class="input-group-text p-0 switch-cell">
                        <div class="form-check form-switch ms-2 me-2 my-1">
                            <input class="form-check-input fix-free-switch" type="checkbox" role="switch"
                                   id="switchR2-${profileId}" checked>
                            <label class="form-check-label ms-2" for="switchR2-${profileId}">Free</label>
                        </div>
                    </span>

                    <input type="text" class="form-control param-value" title="Proton-Metal Distance (second sphere). Unit: m or Å" placeholder="Proton-Metal Distance (second sphere)" value="3">
                    <input type="text" class="form-control param-error" readonly placeholder="Error">
                    <input type="text" class="form-control param-min" placeholder="min">
                    <input type="text" class="form-control param-max" placeholder="max">
                </div>

                <select class="form-select ms-2 narrow-select copy-r2-select"
                        data-param="r2" data-profile="${profileId}">
                    <option value="indie">indie</option>
                </select>
            </div>
        `);

            updateSelectOptions();
        });


        const modelFreeHTML = `
        <div class="form-check mt-3">
            <input type="checkbox" class="form-check-input" id="modelFreeCheckbox-${profileId}">
            <label class="form-check-label" for="modelFreeCheckbox-${profileId}">Model-Free</label>
        </div>
        <div id="modelFreeParametersContainer-${profileId}"></div>`;
        parametersContainer.append(modelFreeHTML);

        $(`#modelFreeCheckbox-${profileId}`).on('change', function () {
            const container = $(`#modelFreeParametersContainer-${profileId}`);
            if (!this.checked) {
                container.empty();
                return;
            }

            container.html(`

            <div class="parameter-input mb-3" data-param="SLS">
                <div class="input-group">

                    <div class="input-group-text dropdown param-label-dropdown">
                        <button class="btn btn-sm btn-light dropdown-toggle" type="button" data-bs-toggle="dropdown">
                            S<sup>2</sup>
                        </button>
                        <ul class="dropdown-menu">
                            <li><a class="dropdown-item active" data-unit="s2">S<sup>2</sup></a></li>
                            <li><a class="dropdown-item" data-unit="sls">SLS</a></li>
                        </ul>
                    </div>

                    <span class="input-group-text p-0 switch-cell">
                        <div class="form-check form-switch ms-2 me-2 my-1">
                            <input class="form-check-input fix-free-switch" type="checkbox"
                                   id="switchSLS-${profileId}" checked>
                            <label class="form-check-label ms-2" for="switchSLS-${profileId}">Free</label>
                        </div>
                    </span>

                    <input type="text" class="form-control param-value sls-value" title="Order parameter. Unit: SLS or S2" placeholder="Order parameter">
                    <input type="text" class="form-control param-error" readonly placeholder="Error">
                    <input type="text" class="form-control param-min" placeholder="min"  value="0">
                    <input type="text" class="form-control param-max" placeholder="max"  value="1">
                </div>

                <select class="form-select ms-2 narrow-select copy-SLS-select"
                        data-param="SLS" data-profile="${profileId}">
                    <option value="indie">indie</option>
                </select>
            </div>

            <div class="parameter-input mb-3" data-param="tl">
                <div class="input-group">
                    <span class="input-group-text">τ<sub>l</sub></span>

                    <span class="input-group-text p-0 switch-cell">
                        <div class="form-check form-switch ms-2 me-2 my-1">
                            <input class="form-check-input fix-free-switch" type="checkbox"
                                   id="switchTl-${profileId}" checked>
                            <label class="form-check-label ms-2" for="switchTl-${profileId}">Free</label>
                        </div>
                    </span>

                    <input type="text" class="form-control param-value" title="Fast local reorientation time. Unit: s" placeholder="Fast local reorientation time">
                    <input type="text" class="form-control param-error" readonly placeholder="Error">
                    <input type="text" class="form-control param-min" placeholder="min" value="1e-12">
                    <input type="text" class="form-control param-max" placeholder="max" value="1e-6">
                </div>

                <select class="form-select ms-2 narrow-select copy-tl-select"
                        data-param="tl" data-profile="${profileId}">
                    <option value="indie">indie</option>
                </select>
            </div>
        `);

            updateSelectOptions();
        });


        const outerSphereHTML = `
        <div class="form-check mt-3">
            <input type="checkbox" class="form-check-input" id="outerSphereCheckbox-${profileId}">
            <label class="form-check-label" for="outerSphereCheckbox-${profileId}">Outer-Sphere</label>
        </div>
        <div id="outerSphereParametersContainer-${profileId}"></div>`;
        parametersContainer.append(outerSphereHTML);

        $(`#outerSphereCheckbox-${profileId}`).on('change', function () {
            const container = $(`#outerSphereParametersContainer-${profileId}`);
            if (!this.checked) {
                container.empty();
                return;
            }

            container.html(`

            <div class="parameter-input mb-3" data-param="D">
                <div class="input-group">
                    <span class="input-group-text">D</span>

                    <span class="input-group-text p-0 switch-cell">
                        <div class="form-check form-switch ms-2 me-2 my-1">
                            <input class="form-check-input fix-free-switch" type="checkbox"
                                   id="switchD-${profileId}" checked>
                            <label class="form-check-label ms-2" for="switchD-${profileId}">Free</label>
                        </div>
                    </span>

                    <input type="text" class="form-control param-value" value="2.4e-9" placeholder="Diffusion coefficient" title="Diffusion coefficient; Unit: m^2/s">
                    <input type="text" class="form-control param-error" readonly placeholder="Error">
                    <input type="text" class="form-control param-min" placeholder="min">
                    <input type="text" class="form-control param-max" placeholder="max" >
                </div>

                <select class="form-select ms-2 narrow-select copy-D-select"
                        data-param="D" data-profile="${profileId}">
                    <option value="indie">indie</option>
                </select>
            </div>


            <div class="parameter-input mb-3" data-param="a">
                <div class="input-group">

                    <div class="input-group-text dropdown param-label-dropdown">
                        <button class="btn btn-sm btn-light dropdown-toggle" type="button" data-bs-toggle="dropdown">
                            a [Å]
                        </button>
                        <ul class="dropdown-menu">
                            <li><a class="dropdown-item active" data-unit="A">a [Å]</a></li>
                            <li><a class="dropdown-item" data-unit="m">a [m]</a></li>
                        </ul>
                    </div>

                    <span class="input-group-text p-0 switch-cell">
                        <div class="form-check form-switch ms-2 me-2 my-1">
                            <input class="form-check-input fix-free-switch" type="checkbox"
                                   id="switchA-${profileId}" checked>
                            <label class="form-check-label ms-2" for="switchA-${profileId}">Free</label>
                        </div>
                    </span>

                    <input type="text" class="form-control param-value" title="distance of closest approach. Unit: m or Å" placeholder="distance of closest approach" value="3.6">
                    <input type="text" class="form-control param-error" readonly placeholder="Error">
                    <input type="text" class="form-control param-min" placeholder="min">
                    <input type="text" class="form-control param-max" placeholder="max">
                </div>

                <select class="form-select ms-2 narrow-select copy-a-select"
                        data-param="a" data-profile="${profileId}">
                    <option value="indie">indie</option>
                </select>
            </div>


            <div class="parameter-input mb-3" data-param="fn">
                <div class="input-group">
                    <span class="input-group-text">f<sub>n</sub></span>

                    <span class="input-group-text p-0 switch-cell">
                        <div class="form-check form-switch ms-2 me-2 my-1">
                            <input class="form-check-input fix-free-switch" type="checkbox"
                                   id="switchFn-${profileId}">
                            <label class="form-check-label ms-2" for="switchFn-${profileId}">Fix</label>
                        </div>
                    </span>

                    <input type="text" class="form-control param-value" title="fraction parameter" placeholder="fraction parameter" value="1">
                    <input type="text" class="form-control param-error" readonly placeholder="Error">
                    <input type="text" class="form-control param-min" value="0" placeholder="min">
                    <input type="text" class="form-control param-max" value="1" placeholder="max">
                </div>

                <select class="form-select ms-2 narrow-select copy-fn-select"
                        data-param="fn" data-profile="${profileId}">
                    <option value="indie">indie</option>
                </select>
            </div>
        `);

            updateSelectOptions();
        });

        updateSelectOptions();
    }

    // Local-only unit dropdown handler (no sync)
    $(document).on("click", ".param-label-dropdown .dropdown-item", function (e) {
        e.preventDefault();
        const $item = $(this);
        const $menu = $item.closest(".param-label-dropdown");
        $menu.find(".dropdown-item").removeClass("active");
        $item.addClass("active");
        $menu.find("button").html($item.html());
    });


// Replace the whole handler with this:
    $(document).on('change', '.fix-free-switch', function () {
        const isChecked = $(this).is(':checked');
        const labelElement = $(this).next('label');
        labelElement.text(isChecked ? 'Free' : 'Fix');
    });


    // Make the open dropdown row overlap neighbors (like _corr.js)
    $(document).on('shown.bs.dropdown', '.param-label-dropdown', function () {
        $(this).closest('.parameter-input').addClass('z-top');
    });
    $(document).on('hidden.bs.dropdown', '.param-label-dropdown', function () {
        $(this).closest('.parameter-input').removeClass('z-top');
    });


    function updateSelectOptions() {
        const paramNames = ["q", "C", "rho", "ms", "S", "tm", "tR", "tv", "r", "Delta2", "Aoh", "q2", "tm2", "r2", "SLS", "tl", "D", "a", "fn"];
        paramNames.forEach(param => {
            // Use a selector that targets both existing and dynamically added select elements
            $(`[class*="copy-${param}-select"]`).each(function () {
                const profileId = $(this).data('profile'); // Current profile ID associated with the dropdown
                $(this).find('option:not([value="indie"])').remove(); // Clear existing options (except "indie")

                for (let i = 1; i <= profileCount; i++) {
                    const sourceProfile = `profile${i}`;
                    if (sourceProfile !== profileId) {
                        $(this).append(`<option value="copy${i}">copy from ${i}</option>`);
                    }
                }
            });
        });
    }


    function updateCopyOptions() {
        const activeTabs = $('.tab-pane').length;

        $('.copy-q-select, .copy-C-select, .copy-rho-select, .copy-ms-select, .copy-S-select, .copy-tm-select, .copy-tR-select, .copy-tv-select, .copy-r-select, .copy-Delta2-select, .copy-Aoh-select, .copy-q2-select, .copy-tm2-select, .copy-r2-select, .copy-SLS-select, .copy-tl-select').each(function () {
            const profileId = $(this).data('profile');

            $(this).find('option:not([value="indie"])').remove();

            for (let i = 1; i <= activeTabs; i++) {
                const tabProfileId = `profile${i}`;
                if (tabProfileId !== profileId) {
                    $(this).append(`<option value="copy${i}">copy from ${i}</option>`);
                }
            }
        });
    }

    function updateTabSelectOptions() {
        const selectElement = $('#tab-select');
        selectElement.empty(); // Clear previous options

        $('.nav-tabs .nav-item .nav-link .tab-title .tab-name').each(function (index) {
            const tabTitle = $(this).text();
            selectElement.append(`<option value="${index + 1}">${tabTitle}</option>`);
        });
    }

    function copyParameterValue(fromProfile, toProfile, paramName) {
        const fromInput = $(`#${fromProfile} .parameter-input[data-param="${paramName}"] .param-value`);
        const toInput   = $(`#${toProfile} .parameter-input[data-param="${paramName}"] .param-value`);
        if (fromInput.length && toInput.length) {
            toInput.val(fromInput.val());
        }
    }



    $(document).on('change', '.copy-q-select, .copy-C-select, .copy-rho-select, .copy-ms-select, .copy-S-select, .copy-tm-select, .copy-tR-select, .copy-tv-select, .copy-r-select, .copy-Delta2-select, .copy-Aoh-select, .copy-q2-select, .copy-tm2-select, .copy-r2-select, .copy-SLS-select, .copy-tl-select, .copy-D-select, .copy-a-select, .copy-fn-select', function () {
        const profileId = $(this).data('profile');
        const selectedOption = $(this).val();
        const paramName = $(this).data('param');

        if (selectedOption.startsWith('copy')) {
            const fromProfile = `profile${selectedOption.replace('copy', '')}`; // Extract the source profile ID

            copyParameterValue(fromProfile, profileId, paramName);

            $(this).val('indie');
        }
    });



    createParameterFields('profile1');

    $('#add-tab').on('click', function () {
        if (activeTabs >= maxTabs) {
            $('#maxTabsToast').toast('show');
            return;
        }

        profileCount++;
        activeTabs++;


        const newTab = `
            <li class="nav-item">
                <span class="tab-close-btn" data-tab="${profileCount}">&times;</span>
                <a class="nav-link" id="profile${profileCount}-tab" data-toggle="tab" href="#profile${profileCount}" role="tab" aria-controls="profile${profileCount}" aria-selected="false">
                    <div class="tab-title">
                        <span id="profile${profileCount}-name">Profile ${profileCount}</span>
                        <span class="editable-profile-name" data-profile="profile${profileCount}">Edit</span>
                        <div class="dropdown-label">
                            <select class="custom-select">
                                <option value="R1" selected>R1</option>
                                <option value="R2" disabled>R2</option>
                            </select>
                        </div>
<!--                        <input type="text" class="form-control additional-input" placeholder="T">-->
                    </div>
                </a>
            </li>
        `;

        const newTabContent = `
        <div class="tab-pane fade" id="profile${profileCount}" role="tabpanel" aria-labelledby="profile${profileCount}-tab">
            <div class="d-flex align-items-center" style="gap: 12px;">
                <button class="btn btn-sm btn-info toggle-parameters" data-profile="profile${profileCount}">
                    Hide System Parameters
                </button>
        
                <div class="fit-quality ms-2 d-none" id="fit-quality-profile${profileCount}"></div>
                <div class="axis-scale ms-2 d-none" id="axis-scale-profile${profileCount}"></div>
            </div>
        </div>
        `;


        $('#add-tab-container').before(newTab);
        $('#myTabContent').append(newTabContent);

        createParameterFields(`profile${profileCount}`);
        $('[data-toggle="tooltip"]').tooltip(); // Reinitialize tooltips
        updateTabSelectOptions(); // Update the new select element
    });

    $(document).on('click', '.tab-close-btn', function () {
        if (activeTabs === 1) {
            $('#lastTabToast').toast('show');
            return;
        }

        const tabId = $(this).data('tab');
        $(`#profile${tabId}-tab`).parent().remove();
        $(`#profile${tabId}`).remove();
        activeTabs--;

        $('.nav-tabs a:first').tab('show');

        // Remove the deleted tab from all copy dropdowns
        $(`.copy-q-select, .copy-C-select, .copy-rho-select, .copy-ms-select, .copy-S-select,
        .copy-tm-select, .copy-tR-select, .copy-tv-select, .copy-r-select, .copy-Delta2-select,
        .copy-Aoh-select, .copy-SLS-select, .copy-tl-select, .copy-D-select, .copy-a-select,
        .copy-fn-select`).each(function () {
            $(this).find(`option[value="copy${tabId}"]`).remove();
        });

        updateTabSelectOptions(); // Update select options after removing tab
    });


    $(document).on('click', '.toggle-parameters', function () {
        const profileId = $(this).data('profile');
        const parametersToToggle = $(`#${profileId} .parameter-input[data-param="q"], #${profileId} .parameter-input[data-param="C"], #${profileId} .parameter-input[data-param="rho"], #${profileId} .parameter-input[data-param="ms"], #${profileId} .parameter-input[data-param="S"]`);

        parametersToToggle.toggle();

        // Toggle button text
        const buttonText = $(this).text() === 'Hide System Parameters' ? 'Show System Parameters' : 'Hide System Parameters';
        $(this).text(buttonText);
    });

    const TWO_PI_c = 2 * 29979245800 * Math.PI;
    function applyFermiCheckboxLogic(data, profileId, isPlotMode = false) {
        const isFermiChecked = $(`#fermiContactTermCheckbox-${profileId}`).is(':checked');

        if (!isFermiChecked) {
            // Fermi is off → Aoh disabled → force zero at index 10
            data["F10"] = "Fix";
            data["Pval10"] = "0";
            data["Pmin10"] = "0";
            data["Pmax10"] = "0";
        } else {
            if (isPlotMode) {
                // Plot mode: include the keys, values from GUI, but still "Fix"
                const paramDiv = $(`#${profileId} .parameter-input[data-param="Aoh"]`);
                if (paramDiv.length) {
                    const input = paramDiv.find('.param-value').val();
                    data["F10"] = "Fix";
                    data["Pval10"] = input !== "" ? input : "";
                    data["Pmin10"] = "";
                    data["Pmax10"] = "";
                } else {
                    // Safe fallback
                    data["F10"] = "Fix";
                    data["Pval10"] = "";
                    data["Pmin10"] = "";
                    data["Pmax10"] = "";
                }
            } else {
                // Normal Fit mode: use full values from inputs
                const paramDiv = $(`#${profileId} .parameter-input[data-param="Aoh"]`);
                if (paramDiv.length) {
                    const input = paramDiv.find('.param-value').val();
                    const min = paramDiv.find('.param-min').val();
                    const max = paramDiv.find('.param-max').val();
                    const fixFree = paramDiv.find('.fix-free-switch').is(':checked') ? "Free" : "Fix";

                    data["F10"] = fixFree;
                    data["Pval10"] = input !== "" ? parseFloat(input) * Aoh_conv : "";
                    data["Pmin10"] = min !== "" ? parseFloat(min) * Aoh_conv : "";
                    data["Pmax10"] = max !== "" ? parseFloat(max) * Aoh_conv : "";

                }
            }
        }
    }

    function saveParametersForAllTabs() {
        let saveRequests = [];
        let tabIndex = 1;

        $('.tab-pane').each(function () {
            const profileId = $(this).attr('id');
            const profileNum = profileId.replace('profile', '');
            const data = {};

            // Profile name
            data["ProfileName"] = $(`#${profileId}-name`).text().trim();

            applyFermiCheckboxLogic(data, profileId, false);

            // Only Aoh occupies a fixed slot (10) because it is always part of the
            // inner-sphere term. Everything else (incl. q2/tm2/r2 when Second sphere
            // is on) is written contiguously in DOM order, with no zero-filled gaps.
            const RESERVED_SLOT_PARAMS = ['Aoh'];

            // Walk parameters
            let index = 0;
            $(`#${profileId} .parameter-input`).each(function () {
                const $row = $(this);
                const paramName = String($row.data('param') || '');
                if (!paramName || RESERVED_SLOT_PARAMS.includes(paramName)) return;

                if (index === 10) index++; // skip slot 10 (reserved for Aoh)

                // Value/min/max inputs
                const $val = $row.find('input[type="text"]').filter(function () {
                    const ph = $(this).attr('placeholder');
                    return ph !== 'min' && ph !== 'max';
                }).first();
                const $min = $row.find('.param-min');
                const $max = $row.find('.param-max');

                const $active = $row.find('.param-label-dropdown .dropdown-item.active');
                const unit = ($active.data('unit') || '').toString(); // e.g. 'cm-1','s-2','A','m','s2','sls'

                // Raw strings
                const rawVal = ($val.val() || "");
                const rawMin = ($min.val() || "");
                const rawMax = ($max.val() || "");

                // Parse numbers (empty stays empty)
                let value    = rawVal === "" ? "" : parseFloat(rawVal);
                let minValue = rawMin === "" ? "" : parseFloat(rawMin);
                let maxValue = rawMax === "" ? "" : parseFloat(rawMax);

                // Inline conversion (UI → backend)
                const conv = (x) => {
                    if (x === "" || !Number.isFinite(x)) return x;

                    // SLS: UI may use S² ("s2"); backend expects SLS → SLS = sqrt(S²)
                    if (paramName === "SLS") {
                        return (unit === "s2") ? Math.sqrt(x) : x;
                    }

                    // Δ²: (cm^-1)^2 → s^-2 via (2πc)^2
                    if (paramName === "Delta2") {
                        return (unit === "cm-1") ? Math.pow(x * TWO_PI_c, 2) : x;
                    }

                    // r, a, r2: Å → m
                    if (paramName === "r" || paramName === "a" || paramName === "r2") {
                        return (unit === "A") ? (x / angstrom) : x; // angstrom = 1e10
                    }

                    // others passthrough
                    return x;
                };

                value    = conv(value);
                minValue = conv(minValue);
                maxValue = conv(maxValue);

                const isChecked = $row.find('.fix-free-switch').is(':checked') ? 'Free' : 'Fix';

                data[`F${index}`]    = isChecked;
                data[`Pval${index}`] = value;
                data[`Pmin${index}`] = minValue;
                data[`Pmax${index}`] = maxValue;

                index++;
            });


            const isModelFreeChecked   = $(`#modelFreeCheckbox-${profileId}`).is(':checked');
            const isOuterSphereChecked = $(`#outerSphereCheckbox-${profileId}`).is(':checked');
            const isSecondSphereChecked = $(`#secondSphereCheckbox-${profileId}`).is(':checked');
            data["ModelFree"]  = isModelFreeChecked ? "true" : "false";
            data["OuterSphere"] = isOuterSphereChecked ? "true" : "false";
            data["SecondSphere"] = isSecondSphereChecked ? "true" : "false";

            let rawInput = $(`#textarea-${profileId}`).val() || "";
            let lines = rawInput.trim().split('\n');

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
            lines = rawInput.split(/\r?\n/);


            let unitFactor = 1;
            const unitLine = lines.find(line => line.trim().toUpperCase().startsWith("# UNIT ="));
            if (unitLine) {
                const unitTxt = unitLine.split("=")[1].trim().toUpperCase();
                if (unitTxt === "MHZ") unitFactor = 1e6;
                else if (unitTxt === "HZ") unitFactor = 1;
            }

            const processedLines = lines.map(line => {
                if (line.trim().startsWith("#") || line.trim() === "") return line;
                const parts = line.trim().split(/\s+/);
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

            // Tags + SelectedDtaSet
            const tagValue = $(`#${profileId}-name`).text().trim();
            data["Tags"] = tagValue ? [tagValue] : [];
            data["SelectedDataSet"] = tagValue;

            const saveRequest = $.ajax({
                type: 'POST',
                url: `/saveTabData/indie_profile${profileNum}`,
                data: JSON.stringify(data),
                contentType: 'application/json'
            });
            saveRequests.push(saveRequest);
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

            const RESERVED_SLOT_PARAMS = ['Aoh'];
            let paramIndex = 0;

            $(`#${profileId} .parameter-input`).each(function () {
                const $row = $(this);
                const paramName = String($row.data('param') || '');

                if (RESERVED_SLOT_PARAMS.includes(paramName)) return;

                if (paramIndex === 10) paramIndex++; // skip slot 10 (reserved for Aoh)
                const index = paramIndex++;

                // Pick value / min / max inputs
                const $val = $row.find('input[type="text"]').filter(function () {
                    const ph = $(this).attr('placeholder');
                    return ph !== 'min' && ph !== 'max';
                }).first();
                const $min = $row.find('.param-min');
                const $max = $row.find('.param-max');

                const $active = $row.find('.param-label-dropdown .dropdown-item.active');
                const unit = ($active.data('unit') || '').toString();

                const rawVal = $val.length ? ($val.val() || "") : "";
                const rawMin = $min.length ? ($min.val() || "") : "";
                const rawMax = $max.length ? ($max.val() || "") : "";

                let value    = rawVal === "" ? "" : parseFloat(rawVal);
                let minValue = rawMin === "" ? "" : parseFloat(rawMin);
                let maxValue = rawMax === "" ? "" : parseFloat(rawMax);

                const conv = (x) => {
                    if (x === "" || !Number.isFinite(x)) return x;

                    if (paramName === "SLS") {
                        return (unit === "s2") ? Math.sqrt(x) : x;
                    }
                    if (paramName === "Delta2") {
                        return (unit === "cm-1") ? Math.pow(x * TWO_PI_c, 2) : x;
                    }
                    if (paramName === "r" || paramName === "a" || paramName === "r2") {
                        return (unit === "A") ? (x / angstrom) : x;
                    }
                    return x;
                };

                value    = conv(value);
                minValue = conv(minValue);
                maxValue = conv(maxValue);

                data[`Pval${index}`] = value;
                data[`Pmin${index}`] = minValue;
                data[`Pmax${index}`] = maxValue;
                data[`F${index}`]    = "";
            });

            applyFermiCheckboxLogic(data, profileId, true);


            const isModelFreeChecked = $(`#modelFreeCheckbox-${profileId}`).is(':checked');
            const isOuterSphereChecked = $(`#outerSphereCheckbox-${profileId}`).is(':checked');
            const isSecondSphereChecked = $(`#secondSphereCheckbox-${profileId}`).is(':checked');
            data["ModelFree"] = isModelFreeChecked ? "true" : "false";
            data["OuterSphere"] = isOuterSphereChecked ? "true" : "false";
            data["SecondSphere"] = isSecondSphereChecked ? "true" : "false";

            data["Tags"] = [data["ProfileName"]];
            data["SelectedDataSet"] = data["ProfileName"];

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
                const matchingFiles = files.filter(file => file.match(`\\d{8}_\\d{4}_indie_profile${profileNumber}\\.json$`));

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
                        ? (mode === "compare"
                            ? parseFitCurvesISOS(data["fit-curves"], data["Function"])
                            : parseFitCurves(data["fit-curves"]))
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



        if (datasets && datasets.data && datasets.data.length) {
            traces.push({
                x: datasets.data.map(p => p.x),
                y: datasets.data.map(p => p.y),
                mode: 'markers',
                type: 'scatter',
                name: 'Data Points',
                visible: (mode === "plot") ? 'legendonly' : true
            });
        }


        if (mode === "compare" && fitCurvesData &&
            (fitCurvesData.IS.length || fitCurvesData.SS.length || fitCurvesData.OS.length)) {
            const contribStyles = [
                { key: 'IS', name: 'IS',         dash: 'solid'   },
                { key: 'SS', name: '2nd sphere', dash: 'dashdot' },
                { key: 'OS', name: 'OS',         dash: 'dot'     },
            ];

            contribStyles.forEach(c => {
                const arr = fitCurvesData[c.key];
                if (!Array.isArray(arr) || !arr.length) return;

                traces.push({
                    x: arr.map(p => p.x),
                    y: arr.map(p => p.y),
                    mode: 'lines',
                    type: 'scatter',
                    name: c.name,
                    line: { dash: c.dash, width: 2 }
                });
            });
        } else if (Array.isArray(fitCurvesData) && fitCurvesData.length) {
            traces.push({
                x: fitCurvesData.map(p => p.x),
                y: fitCurvesData.map(p => p.y),
                mode: 'lines',
                type: 'scatter',
                name: 'Fit Curve',
                line: { dash: 'solid', width: 2 }
            });
        }

        const layout = {
            title: { text: `NMRD Profiles for ${activeTabId}` },
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
            const y = parseFloat(parts[1]);

            if (!Number.isNaN(x) && !Number.isNaN(y)) {
                dataset.data.push({ x, y });
            }
        }
        return dataset;
    }



    function contributionLabelsFromFunction(funcStr) {
        if (!funcStr) return [];
        const body = String(funcStr).replace(/^[^=]*=/, '');     // drop "R1="
        return body.split(/\\\+/).map(t => t.trim()).filter(Boolean).map(term => {
            if (/R1OS|OSabh/i.test(term)) return 'OS';           // outer sphere
            if (/\bq2\b/.test(term))      return 'SS';           // second sphere (uses q2)
            return 'IS';                                         // inner / first sphere
        });
    }

    function parseFitCurvesISOS(fitCurvesArray, funcStr) {
        const labels = contributionLabelsFromFunction(funcStr); // e.g. ['IS','SS'] / ['IS','OS'] / ['IS','SS','OS']
        const series = { IS: [], SS: [], OS: [] };

        fitCurvesArray.forEach(dataString => {
            const lines = dataString.replace(/\\n/g, '\n').trim().split("\n");
            lines.forEach(line => {
                const trimmed = line.trim();
                if (trimmed === '' || trimmed.startsWith('#')) return;

                const parts = trimmed.split(/\s+/).map(Number);
                const x = parts[0];
                if (isNaN(x)) return;

                // Map each term to its column (col 1..N); the trailing total column is ignored.
                labels.forEach((label, i) => {
                    const y = parts[1 + i];
                    if (y !== undefined && !isNaN(y) && series[label]) {
                        series[label].push({ x, y });
                    }
                });
            });
        });

        return series;
    }


    function parseFitCurves(fitCurvesArray) {
        const fitCurvesData = [];

        fitCurvesArray.forEach(dataString => {
            const lines = dataString.replace(/\\n/g, '\n').trim().split("\n");
            lines.forEach(line => {
                const trimmed = line.trim();
                if (trimmed === '' || trimmed.startsWith('#')) return;

                // take x = first number, y = LAST number on the line
                const parts = trimmed.split(/\s+/).map(Number).filter(n => !isNaN(n));
                if (parts.length >= 2) {
                    const x = parts[0];
                    const y = parts[parts.length - 1];
                    fitCurvesData.push({ x, y });
                }
            });
        });

        return fitCurvesData;
    }



// Attach the save functionality to the submit button
    $('#submit-button').on('click', saveParametersForAllTabs);
//     $('#submit-button').on('click', saveForPlot);



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
            saveParametersForAllTabs()
                .then(() => {
                    console.log("Saving complete. Starting fit process...");
                    return $.ajax({ url: '/fit', method: 'POST' });
                })
                .then(response => {
                    console.log("Fitting complete, updating UI...");
                    const fittedData = (typeof response === 'string') ? JSON.parse(response) : response;

                    // For each profile returned by backend
                    Object.keys(fittedData).forEach(function (profileId) {
                        const data = fittedData[profileId];
                        const profileSelector = `#${profileId}`;

                        // --- Aoh (fixed index 10) ---
                        const aohElement = $(`${profileSelector} .parameter-input[data-param="Aoh"]`);
                        if (aohElement.length && Object.prototype.hasOwnProperty.call(data, "Pval10")) {
                            const $val = aohElement.find('.param-value');
                            const converted = data["Pval10"] !== "" ? data["Pval10"] / Aoh_conv : "";
                            $val.val(converted === "" ? "" : formatValue(converted));
                        }

                        // --- Other PvalX values, respecting index 10 skip ---
                        let paramIndex = 0;

                        $(`${profileSelector} .parameter-input`).each(function () {
                            const $row = $(this);
                            const paramName = String($row.data('param') || '');

                            if (!paramName || paramName === "Aoh") return;

                            if (paramIndex === 10) paramIndex = 11; // skip slot 10 (reserved for Aoh)

                            if (!Object.prototype.hasOwnProperty.call(data, `Pval${paramIndex}`)) {
                                paramIndex++;
                                return;
                            }

                            // Pull back-end values
                            let value    = data[`Pval${paramIndex}`];
                            let minValue = data[`Pmin${paramIndex}`];
                            let maxValue = data[`Pmax${paramIndex}`];

                            // Active unit (if the label dropdown exists for this row)
                            const activeUnit = ($row.find('.param-label-dropdown .dropdown-item.active').data('unit')) || null;

                            // Convert from internal (SI) → UI units
                            if (paramName === "Delta2") {
                                // Internal is s^-2; UI may be cm^-1 via: cm^-1 = sqrt(s^-2) / (2πc)
                                if (activeUnit === "cm-1") {
                                    value    = value    !== "" ? Math.sqrt(parseFloat(value))    / TWO_PI_c : "";
                                    minValue = minValue !== "" ? Math.sqrt(parseFloat(minValue)) / TWO_PI_c : "";
                                    maxValue = maxValue !== "" ? Math.sqrt(parseFloat(maxValue)) / TWO_PI_c : "";
                                } else {
                                    value    = value    !== "" ? parseFloat(value)    : "";
                                    minValue = minValue !== "" ? parseFloat(minValue) : "";
                                    maxValue = maxValue !== "" ? parseFloat(maxValue) : "";
                                }
                            } else if (paramName === "r" || paramName === "a" || paramName === "r2") {
                                // Internal is meters; UI may be Å (r2 = second-sphere distance)
                                if (activeUnit === "A") {
                                    value = value !== "" ? parseFloat(value) * angstrom : "";
                                    minValue = minValue !== "" ? parseFloat(minValue) * angstrom : "";
                                    maxValue = maxValue !== "" ? parseFloat(maxValue) * angstrom : "";
                                } else {
                                    value = value !== "" ? parseFloat(value) : "";
                                    minValue = minValue !== "" ? parseFloat(minValue) : "";
                                    maxValue = maxValue !== "" ? parseFloat(maxValue) : "";
                                }
                            } else if (paramName === "SLS") {
                                if (activeUnit === "s2") {
                                    value    = value    !== "" ? Math.pow(parseFloat(value), 2) : "";
                                    minValue = minValue !== "" ? Math.pow(parseFloat(minValue), 2) : "";
                                    maxValue = maxValue !== "" ? Math.pow(parseFloat(maxValue), 2) : "";
                                } else {
                                    // UI wants SLS → no conversion
                                    value    = value    !== "" ? parseFloat(value)    : "";
                                    minValue = minValue !== "" ? parseFloat(minValue) : "";
                                    maxValue = maxValue !== "" ? parseFloat(maxValue) : "";
                                }
                            }
                            else {
                                // Plain numeric passthrough (or blank)
                                value    = value    !== "" ? parseFloat(value)    : "";
                                minValue = minValue !== "" ? parseFloat(minValue) : "";
                                maxValue = maxValue !== "" ? parseFloat(maxValue) : "";
                            }

                            // Write back to new fields
                            const $val = $row.find('.param-value');
                            const $min = $row.find('.param-min');
                            const $max = $row.find('.param-max');

                            if ($val.length) $val.val(value === "" ? "" : formatValue(value));
                            if ($min.length) $min.val(minValue === "" ? "" : formatValue(minValue));
                            if ($max.length) $max.val(maxValue === "" ? "" : formatValue(maxValue));

                            paramIndex++;
                        });

                        (function applyErrorsFromFitResults() {
                            const fitResults = data && data["fit-results"];
                            if (typeof fitResults !== "string") return;

                            const lines = fitResults.trim().split(/\r?\n/);
                            if (lines.length < 2) return;

                            const tokens = lines[1].split(",").map(s => s.trim());

                            const header = lines[0].split(",").map(s => s.trim());
                            let col = header.findIndex(h => /err/i.test(h)) - 1;
                            if (col < 0) col = 6; // fallback

                            function errInternalToUi($row, paramName, errValRaw, storedValRaw) {
                                const s = String(errValRaw ?? "").trim().toLowerCase();
                                if (s === "" || s === "fixed" || s === "constant") return "";

                                let errVal = Number(errValRaw);
                                if (!Number.isFinite(errVal)) return "";

                                const activeUnit = $row.find('.param-label-dropdown .dropdown-item.active').data('unit');

                                if (paramName === "r" || paramName === "a" || paramName === "r2") {
                                    if (activeUnit === "A") errVal = errVal * 1e10;
                                    return errVal;
                                }

                                if (paramName === "Delta2") {
                                    if (activeUnit === "cm-1") {
                                        const TWO_PI_c = 2 * 29979245800 * Math.PI;

                                        const uiVal = Number($row.find('.param-value').val());
                                        if (Number.isFinite(uiVal) && uiVal !== 0) {
                                            errVal = errVal / (2 * uiVal * TWO_PI_c * TWO_PI_c);
                                        } else {
                                            return "";
                                        }
                                    }
                                    return errVal;
                                }

                                if (paramName === "SLS") {
                                    if (activeUnit === "s2") return Math.pow(Number(errValRaw), 2);
                                    return errVal;
                                }

                                if (paramName === "Aoh") {
                                    return errVal / Aoh_conv;
                                }

                                return errVal;
                            }

                            const $aohRow = $(`${profileSelector} .parameter-input[data-param="Aoh"]`);
                            let aohApplied = false;

                            let paramIndex = 0;

                            $(`${profileSelector} .parameter-input`).each(function () {
                                const $row = $(this);
                                const paramName = String($row.data('param') || '');

                                // Insert/apply Aoh when we reach backend index 10
                                if (paramIndex === 10 && !aohApplied) {
                                    const storedVal = tokens[col];
                                    const storedErr = tokens[col + 1];
                                    col += 2;

                                    if ($aohRow.length) {
                                        const uiErr = errInternalToUi($aohRow, "Aoh", storedErr, storedVal);
                                        $aohRow.find('input.param-error').val(uiErr === "" ? "" : formatValue(uiErr));
                                    }
                                    aohApplied = true;

                                    if (paramName !== "Aoh") paramIndex = 11;
                                }

                                if (!paramName || paramName === "Aoh") return;

                                if (paramIndex === 10) paramIndex = 11;

                                // Consume one value+err pair for this parameter
                                const storedVal = tokens[col];
                                const storedErr = tokens[col + 1];
                                col += 2;

                                const uiErr = errInternalToUi($row, paramName, storedErr, storedVal);
                                $row.find('input.param-error').val(uiErr === "" ? "" : formatValue(uiErr));

                                paramIndex++;
                            });

                            // If the DOM iteration never hit index 10, still consume/apply Aoh at the end
                            if (!aohApplied) {
                                // advance to index 10 if needed (safety; usually not needed if DOM order matches)
                                while (paramIndex < 10) {
                                    col += 2;
                                    paramIndex++;
                                }
                                const storedVal = tokens[col];
                                const storedErr = tokens[col + 1];

                                if ($aohRow.length) {
                                    const uiErr = errInternalToUi($aohRow, "Aoh", storedErr, storedVal);
                                    $aohRow.find('input.param-error').val(uiErr === "" ? "" : formatValue(uiErr));
                                }
                            }
                        })();
                        updateFitQualityFromFitResults(profileId, data);
                        $(`#${profileId}-plots-container`).css('visibility', 'visible');
                        setAxisScaleUIVisible(profileId, true);
                        findLatestJsonFile(profileId, "fit");

                    });

                    console.log("UI update complete after fitting.");
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
            const activeTabId = $('#myTabContent .tab-pane.active').attr('id');
            const $fitBox = $(`#fit-quality-${activeTabId}`);
            if ($fitBox.length && $fitBox.html().trim() !== "") {
                $fitBox.toggleClass('d-none');
            }
            setFitUiDisabled(true);
            setSpinnerVisible(true);

            saveForPlot()
                .then(() => {
                    console.log("Saving complete. Starting fit process...");

                    return $.ajax({
                        url: '/fit',
                        method: 'POST',
                    });
                })
                .then(response => {
                    const activeTabId = $('#myTabContent .tab-pane.active').attr('id');
                    console.log("Plot button clicked for tab:", activeTabId);
                    $(`#${activeTabId}-plots-container`).css('visibility', 'visible');
                    setAxisScaleUIVisible(activeTabId, true);
                    findLatestJsonFile(activeTabId, "plot");
                })
                .finally(() => {
                    setSpinnerVisible(false);
                    setFitUiDisabled(false);
                });
        });

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

        $('#cancel-fit-button').off('click').on('click', function () {
            __cancelAjax.abortAll();

            $.ajax({ url: '/fit_cancel', method: 'POST' });

            $('#fit-spinner-overlay').addClass('d-none').removeClass('d-flex');
            $('#fit-button, #plot-button, #switch-plot, #close-plot').prop('disabled', false);

            console.log('[CANCEL] universal abort triggered');
        });


    });


});

$('[data-toggle="tooltip"]').tooltip();

function enableTabRename(profileId, tabNameElement) {
    const currentName = tabNameElement.text();
    const inputField = $(`<input type="text" class="form-control rename-input" value="${currentName}" style="width: auto; display: inline-block;">`);
    tabNameElement.replaceWith(inputField);

    inputField.focus();

    inputField.on('blur', function () {
        const newName = $(this).val();
        inputField.replaceWith(`<span id="${profileId}-name" class="tab-name">${newName}</span>`);
        updateTabSelectOptions();
    });

    inputField.on('keypress', function (e) {
        if (e.which == 13) {
            const newName = $(this).val();
            inputField.replaceWith(`<span id="${profileId}-name" class="tab-name">${newName}</span>`);
            updateTabSelectOptions();
        }
    });
}

(function () {

    window.__indieExportCache = window.__indieExportCache || {};

    function pad2(n) { return String(n).padStart(2, '0'); }

    function makeTimestamp() {
        const d = new Date();
        const HH = pad2(d.getHours());
        const mm = pad2(d.getMinutes());
        const DD = pad2(d.getDate());
        const MM = pad2(d.getMonth() + 1);
        const yy = pad2(d.getFullYear() % 100);
        return HH + mm + DD + MM + yy; // HHmmDDMMyy
    }

    function sanitize(name) {
        return String(name).trim().replace(/\s+/g, '').replace(/[^\w-]/g, '');
    }

    function csvCell(x) {
        const s = (x === null || x === undefined) ? '' : String(x);
        if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
        return s;
    }

    function rowToCsv(cells) {
        return cells.map(csvCell).join(',');
    }

    function downloadBlob(blob, filename) {
        const a = document.createElement('a');
        const url = URL.createObjectURL(blob);
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    function getActiveProfileId() {
        return $('#myTabContent .tab-pane.active').attr('id') || 'profile1';
    }

    function getActiveProfileName(profileId) {
        const label = $(`#${profileId}-name`).text();
        return sanitize(label || profileId || 'profile1');
    }

    function getFixFree($row) {
        const isFree = $row.find('.fix-free-switch').is(':checked');
        return isFree ? 'Free' : 'Fix';
    }

    function getFitQuality(profileId) {
        const cache = window.__indieExportCache[profileId] || {};
        let chi2 = cache.chi2;
        let R2 = cache.R2;

        if ((chi2 === undefined || chi2 === '') || (R2 === undefined || R2 === '')) {
            const $box = $(`#fit-quality-${profileId}`);
            if ($box.length) {
                const tds = $box.find('td');
                if (tds.length >= 4) {
                    chi2 = $(tds[1]).text().trim();
                    R2 = $(tds[3]).text().trim();
                }
            }
        }

        return { chi2: chi2 || '', R2: R2 || '' };
    }

    function getFitCurveSeries(profileId) {
        const cache = window.__indieExportCache[profileId] || {};
        if (Array.isArray(cache.fitX) && cache.fitX.length) {
            return {
                x: cache.fitX || [],
                y1: cache.fitY1 || cache.fitY || [],
                y2: cache.fitY2 || [],
                hasTwo: Array.isArray(cache.fitY2) && cache.fitY2.length > 0
            };
        }

        const gd = document.getElementById(`${profileId}-plot`);
        if (gd && gd.data && gd.data.length) {
            const tIS = gd.data.find(t => t && t.name === 'IS');
            const tOS = gd.data.find(t => t && t.name === 'OS');

            if (tIS && tOS && Array.isArray(tIS.x) && Array.isArray(tIS.y) && Array.isArray(tOS.y)) {
                return { x: tIS.x, y1: tIS.y, y2: tOS.y, hasTwo: true };
            }

            const tFit =
                gd.data.find(t => t && t.name === 'Fit Curve') ||
                tIS || tOS;

            if (tFit && Array.isArray(tFit.x) && Array.isArray(tFit.y)) {
                return { x: tFit.x, y1: tFit.y, y2: [], hasTwo: false };
            }
        }

        return { x: [], y1: [], y2: [], hasTwo: false };
    }

    function getDataInputXYZ(profileId) {
        const raw = $(`#textarea-${profileId}`).val() || '';
        const lines = raw.replace(/\r/g, '').split('\n');

        const x = [];
        const y = [];
        const yerr = [];

        for (const rawLine of lines) {
            const line = rawLine.split('#')[0].trim();
            if (!line) continue;

            const parts = line.split(/\s+/);
            if (parts.length < 2) continue;

            const xv = parseFloat(parts[0]);
            const yv = parseFloat(parts[1]);
            const ev = (parts.length >= 3) ? parseFloat(parts[2]) : NaN;

            if (!Number.isNaN(xv) && !Number.isNaN(yv)) {
                x.push(xv);
                y.push(yv);
                yerr.push(Number.isNaN(ev) ? '' : ev);
            }
        }

        return { x, y, yerr };
    }

    function exportParametersCsv() {
        const profileId = getActiveProfileId();

        if (!getFitCurveSeries(profileId).x.length) {
            alert('Export error: no plot for this tab.');
            return;
        }

        const ts = makeTimestamp();
        const mode = 'indie';
        const profileName = getActiveProfileName(profileId);
        const filename = `${ts}_${mode}_${profileName}.csv`;

        const paramRows = [];
        $(`#${profileId} .parameter-input`).each(function () {
            const $row = $(this);
            const param = String($row.data('param') || '').trim();
            if (!param) return;

            const value = $row.find('.param-value').val();
            const errorRaw = $row.find('.param-error').val();
            const error = (errorRaw === null || errorRaw === undefined || String(errorRaw).trim() === '') ? 'na' : errorRaw;

            paramRows.push({
                param,
                fixfree: getFixFree($row),
                value,
                error
            });
        });

        const { chi2, R2 } = getFitQuality(profileId);
        const fit = getFitCurveSeries(profileId);      // I/J/K
        const dataIn = getDataInputXYZ(profileId);     // N/O/P

        // Column plan (A..P):
        // A Parameter
        // B Fix/Free
        // C Value
        // D Error
        // E chi2
        // F R2
        // G-H fillers
        // I fit_x
        // J fit_y (or fit_y1)
        // K fit_y2 (only if IS+OS)
        // L-M fillers
        // N data_x
        // O data_y
        // P data_y_err
        const header = [
            'Parameter','Fix/Free','Value','Error','chi2','R2',
            '','',
            'fit_x',
            (fit.hasTwo ? 'fit_y1' : 'fit_y'),
            (fit.hasTwo ? 'fit_y2' : ''),
            '','',
            'data_x','data_y','data_y_err'
        ];

        const maxLen = Math.max(paramRows.length, fit.x.length, dataIn.x.length);

        const lines = [];
        lines.push(rowToCsv(header));

        for (let i = 0; i < maxLen; i++) {
            const p = paramRows[i] || {};

            const fx  = (i < fit.x.length)  ? fit.x[i]  : '';
            const fy1 = (i < fit.y1.length) ? fit.y1[i] : '';
            const fy2 = (i < fit.y2.length) ? fit.y2[i] : '';

            const dx = (i < dataIn.x.length)    ? dataIn.x[i]    : '';
            const dy = (i < dataIn.y.length)    ? dataIn.y[i]    : '';
            const de = (i < dataIn.yerr.length) ? dataIn.yerr[i] : '';

            const chi2Cell = (i === 0) ? (chi2 || '') : '';
            const r2Cell   = (i === 0) ? (R2  || '')  : '';

            const row = [
                p.param || '',
                p.fixfree || '',
                p.value || '',
                p.error || '',
                chi2Cell,
                r2Cell,
                '', '',             // G-H
                fx,                 // I
                fy1,                // J
                (fit.hasTwo ? fy2 : ''), // K
                '', '',             // L-M
                dx, dy, de          // N-O-P
            ];

            lines.push(rowToCsv(row));
        }

        const csvText = lines.join('\n') + '\n';
        const blob = new Blob([csvText], { type: 'text/csv;charset=utf-8' });
        downloadBlob(blob, filename);
    }

    $(document)
        .off('click.exportCsv', '#export-button')
        .on('click.exportCsv', '#export-button', function (e) {
            e.preventDefault();
            e.stopPropagation();
            exportParametersCsv();
        });

})();

$(document).on('click', '.editable-profile-name', function () {
    const profileId = $(this).data('profile');
    const tabNameElement = $(`#${profileId}-name`);
    enableTabRename(profileId, tabNameElement);
});







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



