// -----------------------------------------------------------------------------
// Variant detection: the same script powers both /florence-indie and
// /modflorence-indie pages. Everything variant-specific (save URL, fit URL,
// filename pattern) is derived here from window.location.pathname.
// -----------------------------------------------------------------------------
const FLORENCE_VARIANT = window.location.pathname.includes("modflorence") ? "modflorence" : "florence";
const SAVE_TAB_DATA_URL = `/saveTabData_${FLORENCE_VARIANT}`;    // append /${tabIndex} at the call site
const FIT_URL           = `/fit_${FLORENCE_VARIANT}`;
const JSON_FILENAME_RE  = new RegExp(`\\d{8}_\\d{4}_${FLORENCE_VARIANT}_indie\\.json$`);

const angstrom = 10000000000;
const Aoh_conv = 2 * Math.PI * 1000000;

$(document).ready(function () {
    const parameters = [
        { name: "q", long: "number of coordinated H2O", placeholder: "nb. of H2O. q > 0" },
        { name: "C", long: "Concentration of particles m", placeholder: "Unit: mol/L" },
        { name: "gammaI", long: "Gyromagnetic ratio γI value of observed nucleus", placeholder: "γI for 1H 267520000 rad (s T)^{-1}" },
        { name: "r", long: "Proton-Metal Distance", placeholder: "Unit: m or Å" },
        { name: "S", long: "electronic spin", placeholder: "Electronic spin. Unit: Gd(III): 3.5, Mn(II): 2.5" },
        { name: "tm", long: "Lifetime of the water molecule in contact", placeholder: "Unit: s" },
        { name: "tR", long: "Rotational correlation time of the m-q*water aggregate", placeholder: "Unit: s" },
        { name: "tv", long: "Electron relaxation correlation time", placeholder: "Unit: s" },
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

        // build only once
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

        // wire events (profile-scoped)
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


    function createParameterFields(profileId) {

        const parameterContainer = $(`#${profileId}`);

        const flexContainer = `
        <div class="profile-flex">
          <div class="parameters-container" id="${profileId}-parameters" style="width: 50%;"></div>
          <div class="plots-container-florence" id="${profileId}-plots-container" style="width: 820px; visibility: hidden; box-sizing: content-box;">
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
                            Input Data 
<!--                            Input Data for ${profileId}-->
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
                    param.name === 'tv' ? 1e-14 :
                        param.name === 'tR' ? 1e-10 : '';

            const maxDefault =
                param.name === 'tm' ? 1e-6 :
                    param.name === 'tv' ? 1e-9 :
                        param.name === 'tR' ? 1e-5 : '';

            const valueDefault =
                param.name === 'q' ? 1 :
                    param.name === 'C' ? 0.001 :
                        param.name === 'gammaI' ? 2.6752e+8 :
                            param.name === 'r' ? 2.8 :
                                param.name === 'S' ? 2.5 :
                                    param.name === 'tm' ? 1e-9 :
                                        param.name === 'tR' ? 1e-8 :
                                            param.name === 'tv' ? 1e-11 :
                                                param.name === 'Delta2' ? 0.03 : '';


            let uiName = param.name;
            if (param.name === 'Delta2') uiName = 'Δ<sup>2</sup>';
            else if (param.name === 'gammaI') uiName = 'γ<sub>I</sub>';
            else if (param.name === 'tm') uiName = 'τ<sub>m</sub>';
            else if (param.name === 'tR') uiName = 'τ<sub>R</sub>';
            else if (param.name === 'tv') uiName = 'τ<sub>v</sub>';

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
                    <li><a class="dropdown-item" data-unit="ts0">t<sub>s0</sub></a></li>
                </ul>
            </div>`;
            }
            else {
                labelHTML = `<span class="input-group-text">${uiName}</span>`;
            }



            const row = `
            <div class="parameter-input mb-3" data-param="${param.name}">
                <div class="input-group">
                    ${labelHTML}

                    <span class="input-group-text p-0 switch-cell">
                        <div class="form-check form-switch ms-2 me-2 my-1">
                            <input class="form-check-input fix-free-switch" type="checkbox" role="switch"
                                   id="switch${profileId}-${index}"
                                   ${["q","C","gammaI","r","S"].includes(param.name) ? "" : "checked"}>
                            <label class="form-check-label ms-2" for="switch${profileId}-${index}">
                                ${["q","C","gammaI","r","S"].includes(param.name) ? "Fix" : "Free"}
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

<!--                 <select class="form-select ms-2 narrow-select copy-${param.name}-select"
                       data-param="${param.name}" data-profile="${profileId}">
                    <option value="indie">indie</option>
                 </select>-->
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

<!--                 <select class="form-select ms-2 narrow-select copy-Aoh-select"
                        data-param="Aoh" data-profile="${profileId}">
                    <option value="indie">indie</option>
                </select>-->
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
            </div>

            <div class="parameter-input mb-3" data-param="tm2">
                <div class="input-group">
                    <span class="input-group-text">τ<sub>m</sub></span>

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
            </div>
        `);
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

                    <input type="text" class="form-control param-value" title="Diffusion coefficient; Unit: m^2/s" placeholder="Diffusion Coefficient" value="3.0e-9">
                    <input type="text" class="form-control param-error" readonly placeholder="Error">
                    <input type="text" class="form-control param-min" placeholder="min">
                    <input type="text" class="form-control param-max" placeholder="max" >
                </div>

<!--                 <select class="form-select ms-2 narrow-select copy-D-select"
                        data-param="D" data-profile="${profileId}">
                    <option value="indie">indie</option>
                </select> -->
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

                    <input type="text" class="form-control param-value" title="distance of closest approach. Unit: m or Å" placeholder="dist. of closest approach" value="3.6">
                    <input type="text" class="form-control param-error" readonly placeholder="Error">
                    <input type="text" class="form-control param-min" placeholder="min">
                    <input type="text" class="form-control param-max" placeholder="max">
                </div>

<!--                 <select class="form-select ms-2 narrow-select copy-a-select"
                        data-param="a" data-profile="${profileId}">
                    <option value="indie">indie</option>
                </select>-->
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

                    <input type="text" class="form-control param-value" title="OS fraction fn" placeholder="OS fraction fn" value="1">
                    <input type="text" class="form-control param-error" readonly placeholder="Error">
                    <input type="text" class="form-control param-min" value="0" placeholder="min">
                    <input type="text" class="form-control param-max" value="1" placeholder="max">
                </div>
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
                            S²
                        </button>
                        <ul class="dropdown-menu">
                            <li><a class="dropdown-item active" data-unit="s2">S²</a></li>
                            <li><a class="dropdown-item" data-unit="sls">SLS</a></li>
                        </ul>
                    </div>
        
                    <span class="input-group-text p-0 switch-cell">
                        <div class="form-check form-switch ms-2 me-2 my-1">
                            <input class="form-check-input fix-free-switch" type="checkbox"
                                   id="switchSLS-${profileId}" checked>
                            <label class="form-check-label ms-2">Free</label>
                        </div>
                    </span>
        
                    <input type="text" class="form-control param-value"
                           placeholder="Order parameter">
        
                    <input type="text" class="form-control param-error" readonly placeholder="Error">
        
                    <input type="text" class="form-control param-min" value="0" placeholder="min">
                    <input type="text" class="form-control param-max" value="1" placeholder="max">
                </div>
            </div>


            <div class="parameter-input mb-3" data-param="tl">
                <div class="input-group">
        
                    <span class="input-group-text">τ<sub>l</sub></span>
        
                    <span class="input-group-text p-0 switch-cell">
                        <div class="form-check form-switch ms-2 me-2 my-1">
                            <input class="form-check-input fix-free-switch" type="checkbox"
                                   id="switchTAULM-${profileId}" checked>
                            <label class="form-check-label ms-2">Free</label>
                        </div>
                    </span>
        
                    <input type="text" class="form-control param-value"
                           placeholder="Local motion time">
        
                    <input type="text" class="form-control param-error" readonly placeholder="Error">
        
                    <input type="text" class="form-control param-min" value="1e-12" placeholder="min">
                    <input type="text" class="form-control param-max" value="1e-6" placeholder="max">
                </div>
            </div>
            `);
        });

        const zfsHTML = `
            <div class="mt-3" id="zfsBlock-${profileId}"></div>
            `;
            parametersContainer.append(zfsHTML);

            function zfsMode() {
                // radios are named like: zfsSymmetry-profile1, zfsSymmetry-profile2, ...
                return $(`input[name="zfsSymmetry-${profileId}"]:checked`).val() || "none";
            }

        function zfsParamRow(paramName, labelHTML, placeholderText = "", minVal = "", maxVal = "") {
            return `
        <div class="parameter-input mb-3" data-param="${paramName}">
            <div class="input-group">
                <span class="input-group-text">${labelHTML}</span>
        
                <span class="input-group-text p-0 switch-cell">
                    <div class="form-check form-switch ms-2 me-2 my-1">
                        <input class="form-check-input fix-free-switch" type="checkbox"
                               id="switch${paramName}-${profileId}" checked>
                        <label class="form-check-label ms-2" for="switch${paramName}-${profileId}">Free</label>
                    </div>
                </span>
        
                <input type="text" class="form-control param-value" placeholder="${placeholderText}">
                <input type="text" class="form-control param-error" placeholder="Error" readonly>
                <input type="text" class="form-control param-min" placeholder="min" value="${minVal}">
                <input type="text" class="form-control param-max" placeholder="max" value="${maxVal}">
            </div>
        </div>`;
        }

            function renderZfsBlock() {
                const mode = zfsMode();
                const $block = $(`#zfsBlock-${profileId}`);

                // NONE: keep as-is now (no extra ZFS UI)
                if (mode === "none") {
                    $block.empty();
                    return;
                }

                // AXIAL or RHOMBIC: show the 4 checkboxes + empty param containers
                $block.html(`
                <div class="form-check mt-3">
                    <input type="checkbox" class="form-check-input zfsOpt" id="zfsAnglesChk-${profileId}">
                    <label class="form-check-label" for="zfsAnglesChk-${profileId}">Angles</label>
                </div>
                <div id="zfsAnglesParams-${profileId}"></div>
        
                <div class="form-check mt-2">
                    <input type="checkbox" class="form-check-input zfsOpt" id="zfsStaticChk-${profileId}">
                    <label class="form-check-label" for="zfsStaticChk-${profileId}">Static ZFS</label>
                </div>
                <div id="zfsStaticParams-${profileId}"></div>
        
                <div class="form-check mt-2">
                    <input type="checkbox" class="form-check-input zfsOpt" id="zfsGTensorChk-${profileId}">
                    <label class="form-check-label" for="zfsGTensorChk-${profileId}">g-tensor</label>
                </div>
                <div id="zfsGTensorParams-${profileId}"></div>
        
                <div class="form-check mt-2">
                    <input type="checkbox" class="form-check-input zfsOpt" id="zfsHyperfineChk-${profileId}">
                    <label class="form-check-label" for="zfsHyperfineChk-${profileId}">Hyperfine coupling</label>
                </div>
                <div id="zfsHyperfineParams-${profileId}"></div>
    `);

                // Wire checkbox handlers (profile-local)
                $(`#zfsAnglesChk-${profileId}`).off('change').on('change', function () {
                    const $c = $(`#zfsAnglesParams-${profileId}`);
                    if (!this.checked) { $c.empty(); return; }

                    if (mode === "axial") {
                        $c.html(
                            zfsParamRow("thetam", "θ<sub>m</sub>", "θ Angle", 0, 90)                        );
                    } else { // rhombic
                        $c.html(
                            zfsParamRow("thetam", "θ<sub>m</sub>", "θ Angle", 0, 90) +
                            zfsParamRow("phim",   "φ<sub>m</sub>", "φ Angle")
                        );
                    }
                });

                $(`#zfsStaticChk-${profileId}`).off('change').on('change', function () {
                    const $c = $(`#zfsStaticParams-${profileId}`);
                    if (!this.checked) { $c.empty(); return; }

                    if (mode === "axial") {
                        $c.html(
                            zfsParamRow("dparam", "DP", "D Axial Part")
                        );
                    } else { // rhombic
                        $c.html(
                            zfsParamRow("dparam", "DP", "D Axial Part") +
                            zfsParamRow("eparam", "EP", "E Rhombic Part")
                        );
                    }
                });

                $(`#zfsGTensorChk-${profileId}`).off('change').on('change', function () {
                    const $c = $(`#zfsGTensorParams-${profileId}`);
                    if (!this.checked) { $c.empty(); return; }

                    if (mode === "axial") {
                        $c.html(
                            zfsParamRow("gxy", "g<sub>xy</sub>", "gxy") +
                            zfsParamRow("gz",  "g<sub>z</sub>",  "gz")
                        );
                        $c.find('.parameter-input[data-param="gxy"] .param-value').val('2.0023');
                        $c.find('.parameter-input[data-param="gz"]  .param-value').val('2.0023');
                    } else { // rhombic
                        $c.html(
                            zfsParamRow("gx", "g<sub>x</sub>", "gx") +
                            zfsParamRow("gy", "g<sub>y</sub>", "gy") +
                            zfsParamRow("gz", "g<sub>z</sub>", "gz")
                        );
                        $c.find('.parameter-input[data-param="gx"] .param-value').val('2.0023');
                        $c.find('.parameter-input[data-param="gy"] .param-value').val('2.0023');
                        $c.find('.parameter-input[data-param="gz"] .param-value').val('2.0023');
                    }
                });


                $(`#zfsHyperfineChk-${profileId}`).off('change').on('change', function () {
                    const $c = $(`#zfsHyperfineParams-${profileId}`);
                    if (!this.checked) { $c.empty(); return; }

                    if (mode === "axial") {
                        $c.html(
                            zfsParamRow("Axy", "A<sub>xy</sub>", "Hyperfine coupling") +
                            zfsParamRow("Az",  "A<sub>z</sub>",  "Hyperfine coupling") +
                            zfsParamRow("SI",  "S<sub>I</sub>",  "Metal Nuclear Spin")
                        );
                    } else { // rhombic
                        $c.html(
                            zfsParamRow("Ax", "A<sub>x</sub>", "Hyperfine coupling") +
                            zfsParamRow("Ay", "A<sub>y</sub>", "Hyperfine coupling") +
                            zfsParamRow("Az", "A<sub>z</sub>", "Hyperfine coupling") +
                            zfsParamRow("SI", "S<sub>I</sub>", "Metal Nuclear Spin")
                        );
                    }
                });
            }

// Re-render when ZFS radio changes for this profile
            $(document).off(`change.zfs.${profileId}`, `input[name="zfsSymmetry-${profileId}"]`)
                .on(`change.zfs.${profileId}`, `input[name="zfsSymmetry-${profileId}"]`, function () {
                    renderZfsBlock();
                });

// Initial render (Axial is default in your UI)
            renderZfsBlock();



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
        const paramNames = ["q", "C", "gammaI", "r", "S", "tm", "tR", "tv", "Delta2", "Aoh", "SLS", "tl", "D", "a", "fn"];
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


    // // Function to dynamically update select options for parameter copying based on active tabs
    // function updateCopyOptions() {
    //     const activeTabs = $('.tab-pane').length;  // Get the current number of tabs
    //
    //     // Loop over each copy select element for each parameter
    //     $('.copy-q-select, .copy-C-select, .copy-rho-select, .copy-ms-select, .copy-S-select, .copy-tm-select, .copy-tR-select, .copy-tv-select, .copy-r-select, .copy-Delta2-select, .copy-Aoh-select, .copy-SLS-select, .copy-tl-select').each(function () {
    //         const profileId = $(this).data('profile');
    //
    //         // Clear all options except 'indie'
    //         $(this).find('option:not([value="indie"])').remove();
    //
    //         // Add options for each tab except the current one
    //         for (let i = 1; i <= activeTabs; i++) {
    //             const tabProfileId = `profile${i}`;
    //             if (tabProfileId !== profileId) {
    //                 $(this).append(`<option value="copy${i}">copy from ${i}</option>`);
    //             }
    //         }
    //     });
    // }

    // Function to update the new select element
    function updateTabSelectOptions() {
        const selectElement = $('#tab-select');
        selectElement.empty(); // Clear previous options

        $('.nav-tabs .nav-item .nav-link .tab-title .tab-name').each(function (index) {
            const tabTitle = $(this).text();
            selectElement.append(`<option value="${index + 1}">${tabTitle}</option>`);
        });
    }


    // Initialize the first tab with its parameters
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
                        <input type="text" class="form-control additional-input" placeholder="T">
                    </div>
                </a>
            </li>
        `;

        const newTabContent = `
        <div class="tab-pane fade" id="profile${profileCount}" role="tabpanel" aria-labelledby="profile${profileCount}-tab">
            <div class="d-flex align-items-center" style="gap: 12px;">
                <button class="btn btn-sm btn-info toggle-parameters" data-profile="profile${profileCount}">Hide System Parameters</button>
        
                <div class="btn-group btn-group-sm" role="group" aria-label="ZFS symmetry">
                    <input type="radio" class="btn-check" name="zfsSymmetry-profile${profileCount}" id="zfs-none-profile${profileCount}" value="none" autocomplete="off">
                    <label class="btn btn-outline-secondary" for="zfs-none-profile${profileCount}">None</label>
        
                    <input type="radio" class="btn-check" name="zfsSymmetry-profile${profileCount}" id="zfs-axial-profile${profileCount}" value="axial" autocomplete="off" checked>
                    <label class="btn btn-outline-secondary" for="zfs-axial-profile${profileCount}">Axial</label>
        
                    <input type="radio" class="btn-check" name="zfsSymmetry-profile${profileCount}" id="zfs-rhombic-profile${profileCount}" value="rhombic" autocomplete="off">
                    <label class="btn btn-outline-secondary" for="zfs-rhombic-profile${profileCount}">Rhombic</label>
                </div>
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


        updateTabSelectOptions(); // Update select options after removing tab
    });


    $(document).on('click', '.toggle-parameters', function () {
        const profileId = $(this).data('profile');
        const parametersToToggle = $(`#${profileId} .parameter-input[data-param="q"], #${profileId} .parameter-input[data-param="C"], #${profileId} .parameter-input[data-param="gammaI"], #${profileId} .parameter-input[data-param="r"], #${profileId} .parameter-input[data-param="S"]`);

        parametersToToggle.toggle();

        const buttonText = $(this).text() === 'Hide System Parameters' ? 'Show System Parameters' : 'Hide System Parameters';
        $(this).text(buttonText);
    });

    const TWO_PI_c = 2 * 29979245800 * Math.PI;


    const SS_PARAMS = ["tm2", "r2", "q2"];
    function ssStartIndex(profileId) {
        const isMF = $(`#modelFreeCheckbox-${profileId}`).is(':checked');
        return (isMF ? 25 : 23) + 2;   // FLAG, FN, then second sphere
    }

    function saveParams_Florence() {

        const FLORENCE_ORDER = [
            { ui: "SI",         group: "hyperfine" },             // 0
            { ui: "gammaI",     group: null },                    // 1
            { ui: "S",          group: null },                    // 2  (SPIN in JSON)
            { ui: "Delta2",     group: null },                    // 3
            { ui: "tR",         group: null },                    // 4
            { ui: "tv",         group: null },                    // 5
            { ui: "tm",         group: null },                    // 6
            { ui: "dparam",     group: "static" },                // 7
            { ui: "eparam",     group: "static" },                // 8
            { ui: ["gx","gxy"], group: "gtensor" },               // 9  (gx slot; gxy aliases here)
            { ui: "gy",         group: "gtensor" },               // 10
            { ui: "gz",         group: "gtensor" },               // 11
            { ui: ["Ax","Axy"], group: "hyperfine" },             // 12 (Ax slot; Axy aliases here)
            { ui: "Ay",         group: "hyperfine" },             // 13
            { ui: "Az",         group: "hyperfine" },             // 14
            { ui: "C",          group: null },                    // 15 (CONCM)
            { ui: "r",          group: null },                    // 16 (RKM)
            { ui: "a",          group: null },                    // 17 (DM)
            { ui: "D",          group: null },                    // 18 (DDM)
            { ui: "Aoh",        group: null },                    // 19 (ACONTM)
            { ui: "q",          group: null },                    // 20 (AMOLFRAM)
            { ui: "thetam",     group: "angles" },                // 21 (THETAM)
            { ui: "phim",       group: "angles" }                 // 22 (PHIM)
        ];

        function getZfsClosedMap(profileId) {
            const isOff = (sel) => {
                const $c = $(sel);
                return ($c.length > 0 && !$c.is(':checked'));
            };
            return {
                angles:    isOff(`#zfsAnglesChk-${profileId}`),
                static:    isOff(`#zfsStaticChk-${profileId}`),
                gtensor:   isOff(`#zfsGTensorChk-${profileId}`),
                hyperfine: isOff(`#zfsHyperfineChk-${profileId}`)
            };
        }

        function findRow(profileId, nameOrList) {
            if (Array.isArray(nameOrList)) {
                for (const nm of nameOrList) {
                    const $r = $(`#${profileId} .parameter-input[data-param="${nm}"]`).first();
                    if ($r.length) return $r;
                }
                return $();
            }
            return $(`#${profileId} .parameter-input[data-param="${nameOrList}"]`).first();
        }

        function readRow($row) {
            if (!$row || !$row.length) {
                return { F: "Fix", Pval: 0, Pmin: "", Pmax: "" };
            }

            const $val = $row.find('input[type="text"]').filter(function () {
                const ph = ($(this).attr('placeholder') || '').toLowerCase();
                return ph !== 'min' && ph !== 'max';
            }).first();

            const $min = $row.find('.param-min').first();
            const $max = $row.find('.param-max').first();

            const rawVal = ($val.val() ?? "").toString().trim();
            const rawMin = ($min.val() ?? "").toString().trim();
            const rawMax = ($max.val() ?? "").toString().trim();

            let v    = rawVal === "" ? 0 : parseFloat(rawVal);
            let vmin = rawMin === "" ? "" : parseFloat(rawMin);
            let vmax = rawMax === "" ? "" : parseFloat(rawMax);

            const paramName = String($row.data('param') || "");
            const $active = $row.find('.param-label-dropdown .dropdown-item.active').first();
            const unit = ($active.data('unit') || '').toString();

            const conv = (x) => {
                if (x === "") return "";
                if (!Number.isFinite(x)) return "";

                if (paramName === "r" || paramName === "r2") {
                    return (unit === "m") ? (x * angstrom) : x;  // m -> Å
                }

                if (paramName === "a") {
                    return (unit === "A") ? (x / angstrom) : x;  // Å -> m
                }

                if (paramName === "q" || paramName === "q2") {
                    return 2 * x;
                }

                if (paramName === "Delta2") {
                    if (unit === "s-2") {
                        // s^-2 -> cm^-1  (cm^-1 = sqrt(s^-2) / (2πc))
                        return Math.sqrt(x) / TWO_PI_c;
                    }
                    return x; // cm-1 or ts0
                }

                if (paramName === "SLS") {
                    if (unit === "sls") {
                        return x * x;
                    }
                    return x;
                }

                return x;
            };

            v = conv(v); vmin = conv(vmin); vmax = conv(vmax);

            const isFree = $row.find('.fix-free-switch').is(':checked');
            const F = isFree ? "Free" : "Fix";

            return { F, Pval: v, Pmin: vmin, Pmax: vmax };
        }

        let saveRequests = [];
        let tabIndex = 1;

        $('.tab-pane').each(function () {

            const profileId = $(this).attr('id');
            const data = {};

            data["ProfileName"] = $(`#${profileId}-name`).text().trim();

            const zfsClosed = getZfsClosedMap(profileId);

            // Write Florence parameter vector 0..22 deterministically
            for (let i = 0; i < FLORENCE_ORDER.length; i++) {


                (function mirrorAxialXYtoYSlots() {

                    const $gxy = findRow(profileId, "gxy");
                    const $gy  = findRow(profileId, "gy");

                    if ($gxy.length && !$gy.length) {
                        const vv = readRow($gxy);
                        data["F10"]    = vv.F;
                        data["Pval10"] = vv.Pval;
                        data["Pmin10"] = vv.Pmin;
                        data["Pmax10"] = vv.Pmax;
                    }

                    const $Axy = findRow(profileId, "Axy");
                    const $Ay  = findRow(profileId, "Ay");

                    if ($Axy.length && !$Ay.length) {
                        const vv = readRow($Axy);
                        data["F13"]    = vv.F;
                        data["Pval13"] = vv.Pval;
                        data["Pmin13"] = vv.Pmin;
                        data["Pmax13"] = vv.Pmax;
                    }
                })();


                const spec = FLORENCE_ORDER[i];

                if (spec.group && zfsClosed[spec.group]) {
                    data[`F${i}`] = "Fix";

                    const defaultVal = (spec.group === 'gtensor') ? 2.0023 : 0;

                    data[`Pval${i}`] = defaultVal;
                    data[`Pmin${i}`] = "";
                    data[`Pmax${i}`] = "";
                    continue;
                }


                const $row = findRow(profileId, spec.ui);
                const vv = readRow($row);

                data[`F${i}`] = vv.F;
                data[`Pval${i}`] = vv.Pval;
                data[`Pmin${i}`] = vv.Pmin;
                data[`Pmax${i}`] = vv.Pmax;
            }

            const isModelFreeChecked = $(`#modelFreeCheckbox-${profileId}`).is(':checked');
            data["ModelFree"] = isModelFreeChecked ? "true" : "false";

            if (isModelFreeChecked) {

                const slsRow = $(`#${profileId} .parameter-input[data-param="SLS"]`);
                const taulmRow = $(`#${profileId} .parameter-input[data-param="tl"]`);

                if (slsRow.length) {
                    const vvSLS = readRow(slsRow);
                    data["F23"]    = vvSLS.F;
                    data["Pval23"] = vvSLS.Pval;
                    data["Pmin23"] = vvSLS.Pmin;
                    data["Pmax23"] = vvSLS.Pmax;
                }

                if (taulmRow.length) {
                    data["F24"] = taulmRow.find(".fix-free-switch").is(':checked') ? "Free" : "Fix";
                    data["Pval24"] = taulmRow.find(".param-value").val() || "0";
                    data["Pmin24"] = taulmRow.find(".param-min").val() || "0";
                    data["Pmax24"] = taulmRow.find(".param-max").val() || "0";
                }
            }

            const isOuterSphereChecked = $(`#outerSphereCheckbox-${profileId}`).is(':checked');
            data["OuterSphere"] = isOuterSphereChecked ? "true" : "false";

            if (isOuterSphereChecked) {
                const fnRow = $(`#${profileId} .parameter-input[data-param="fn"]`);
                if (fnRow.length) {
                    const flagIndex = isModelFreeChecked ? 25 : 23;
                    const fnIndex   = flagIndex + 1;
                    const vvFn = readRow(fnRow);
                    data[`F${fnIndex}`]    = vvFn.F;
                    data[`Pval${fnIndex}`] = vvFn.Pval;
                    data[`Pmin${fnIndex}`] = vvFn.Pmin;
                    data[`Pmax${fnIndex}`] = vvFn.Pmax;
                }
            }

            const isSecondSphereChecked = $(`#secondSphereCheckbox-${profileId}`).is(':checked');
            data["SecondSphere"] = isSecondSphereChecked ? "true" : "false";

            if (isSecondSphereChecked) {
                const ssStart = ssStartIndex(profileId);
                SS_PARAMS.forEach((p, k) => {
                    const vv = readRow(findRow(profileId, p));
                    data[`F${ssStart + k}`]    = vv.F;
                    data[`Pval${ssStart + k}`] = vv.Pval;
                    data[`Pmin${ssStart + k}`] = vv.Pmin;
                    data[`Pmax${ssStart + k}`] = vv.Pmax;
                });
            }


            let rawInput = $(`#textarea-${profileId}`).val() || "";
            let lines = rawInput.trim().split('\n');

            function injectDataN(text, profileId) {
                const lns = text.split(/\r?\n/);
                const out = [];

                const tRaw = $(`#${profileId}-tab`).find('input.additional-input').val();
                const tVal = (tRaw ?? "").toString().trim() || "298"; // fallback keeps previous behavior

                for (const ln of lns) {
                    if (ln.trim().startsWith("# TAG")) {
                        out.push(`# DATA N = ${tVal}`);
                    }
                    out.push(ln);
                }
                return out.join("\n");
            }


            rawInput = injectDataN(rawInput, profileId);
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

            const tagValue = $(`#${profileId}-name`).text().trim();
            data["Tags"] = tagValue ? [tagValue] : [];
            data["SelectedDataSet"] = tagValue;

            // RESTORED behavior: profileIndex comes from tabIndex (scales to more profiles)
            const saveRequest = $.ajax({
                type: 'POST',
                url: `${SAVE_TAB_DATA_URL}/${tabIndex}`,
                data: JSON.stringify(data),
                contentType: 'application/json'
            });

            saveRequests.push(saveRequest);
            tabIndex++;
        });

        return Promise.all(saveRequests);
    }


    function saveForPlot_Florence() {
        const FLORENCE_ORDER = [
            { ui: "SI",         group: "hyperfine" },   // 0
            { ui: "gammaI",     group: null },          // 1
            { ui: "S",          group: null },          // 2
            { ui: "Delta2",     group: null },          // 3
            { ui: "tR",         group: null },          // 4
            { ui: "tv",         group: null },          // 5
            { ui: "tm",         group: null },          // 6
            { ui: "dparam",     group: "static" },      // 7
            { ui: "eparam",     group: "static" },      // 8
            { ui: ["gx","gxy"], group: "gtensor" },     // 9
            { ui: "gy",         group: "gtensor" },     // 10
            { ui: "gz",         group: "gtensor" },     // 11
            { ui: ["Ax","Axy"], group: "hyperfine" },   // 12
            { ui: "Ay",         group: "hyperfine" },   // 13
            { ui: "Az",         group: "hyperfine" },   // 14
            { ui: "C",          group: null },          // 15
            { ui: "r",          group: null },          // 16
            { ui: "a",          group: null },          // 17
            { ui: "D",          group: null },          // 18
            { ui: "Aoh",        group: null },          // 19
            { ui: "q",          group: null },          // 20
            { ui: "thetam",     group: "angles" },      // 21
            { ui: "phim",       group: "angles" }       // 22
        ];

        function getZfsClosedMap(profileId) {
            const isOff = (sel) => {
                const $c = $(sel);
                return ($c.length > 0 && !$c.is(':checked'));
            };
            return {
                angles:    isOff(`#zfsAnglesChk-${profileId}`),
                static:    isOff(`#zfsStaticChk-${profileId}`),
                gtensor:   isOff(`#zfsGTensorChk-${profileId}`),
                hyperfine: isOff(`#zfsHyperfineChk-${profileId}`)
            };
        }

        function findRow(profileId, nameOrList) {
            if (Array.isArray(nameOrList)) {
                for (const nm of nameOrList) {
                    const $r = $(`#${profileId} .parameter-input[data-param="${nm}"]`).first();
                    if ($r.length) return $r;
                }
                return $();
            }
            return $(`#${profileId} .parameter-input[data-param="${nameOrList}"]`).first();
        }

        function readValueForPlot($row) {
            if (!$row || !$row.length) return 0;

            const paramName = String($row.data('param') || "");
            const $val = $row.find('input[type="text"]').filter(function () {
                const ph = ($(this).attr('placeholder') || '').toLowerCase();
                return ph !== 'min' && ph !== 'max';
            }).first();

            const raw = ($val.val() ?? "").toString().trim();
            if (raw === "") return 0;

            let v = parseFloat(raw);
            if (!Number.isFinite(v)) return 0;

            const $active = $row.find('.param-label-dropdown .dropdown-item.active').first();
            const unit = ($active.data('unit') || '').toString();

            // r: store Å
            if (paramName === "r" || paramName === "r2") {
                return (unit === "m") ? (v * angstrom) : v;
            }

            // a: store m
            if (paramName === "a") {
                return (unit === "A") ? (v / angstrom) : v;
            }

            if (paramName === "q" || paramName === "q2") {
                return 2 * v;
            }

            if (paramName === "Delta2") {
                if (unit === "s-2") return Math.sqrt(v) / TWO_PI_c;
                return v; // cm-1 or ts0
            }

            if (paramName === "SLS") {
                if (unit === "sls") {
                    return v * v;
                }
                return v;
            }

            return v;
        }

        function injectDataP(text, profileId) {
            const lns = text.split(/\r?\n/);
            const out = [];

            // keep same behavior as saveParams_Florence: use the tab's additional-input as DATA P
            const tRaw = $(`#${profileId}-tab`).find('input.additional-input').val();
            const tVal = (tRaw ?? "").toString().trim() || "1";

            for (const ln of lns) {
                if (ln.trim().startsWith("# TAG")) {
                    out.push(`# DATA N = ${tVal}`);
                }
                out.push(ln);
            }
            return out.join("\n");
        }

        let saveRequests = [];
        let tabIndex = 1;

        $('.tab-pane').each(function () {
            const profileId = $(this).attr('id');
            const data = {};

            data["ProfileName"] = $(`#${profileId}-name`).text().trim();
            data["Mode"] = "plot";
            data["ProfileIndex"] = tabIndex; // lets Java dummy generator know which dataset index to use

            // ===== Dados =====
            let rawInput = ($(`#textarea-${profileId}`).val() || "").toString();

            // If user didn't provide real data, trigger Java dummy (your requirement)
            const trimmed = rawInput.trim();
            if (trimmed === "" || trimmed.includes("<Add input here>")) {
                data["Dados"] = "<Add input here>";
            } else {
                rawInput = injectDataP(rawInput, profileId);
                const lines = rawInput.split(/\r?\n/);

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
            }

            const zfsClosed = getZfsClosedMap(profileId);
            const isFermiChecked = $(`#fermiContactTermCheckbox-${profileId}`).is(':checked');

            for (let i = 0; i < FLORENCE_ORDER.length; i++) {
                const spec = FLORENCE_ORDER[i];

                // ZFS block OFF -> force Fix/default
                if (spec.group && zfsClosed[spec.group]) {
                    data[`F${i}`] = "Fix";

                    const defaultVal = (spec.group === 'gtensor') ? 2.0023 : 0;

                    data[`Pval${i}`] = defaultVal;
                    data[`Pmin${i}`] = "";
                    data[`Pmax${i}`] = "";
                    continue;
                }


                if (i === 19 && !isFermiChecked) {
                    data[`F${i}`] = "Fix";
                    data[`Pval${i}`] = 0;
                    data[`Pmin${i}`] = "";
                    data[`Pmax${i}`] = "";
                    continue;
                }

                const $row = findRow(profileId, spec.ui);
                const v = readValueForPlot($row);

                data[`F${i}`] = "Fix";
                data[`Pval${i}`] = v;
                data[`Pmin${i}`] = "";
                data[`Pmax${i}`] = "";
            }

            const isModelFreeChecked = $(`#modelFreeCheckbox-${profileId}`).is(':checked');
            data["ModelFree"] = isModelFreeChecked ? "true" : "false";

            if (isModelFreeChecked) {

                const slsRow   = $(`#${profileId} .parameter-input[data-param="SLS"]`);
                const taulmRow = $(`#${profileId} .parameter-input[data-param="tl"]`);

                if (slsRow.length) {
                    if (slsRow.length) {
                        const vSLS = readValueForPlot(slsRow);
                        data["F23"]    = slsRow.find(".fix-free-switch").is(':checked') ? "Free" : "Fix";
                        data["Pval23"] = vSLS;
                        data["Pmin23"] = slsRow.find(".param-min").val()   || "0";
                        data["Pmax23"] = slsRow.find(".param-max").val()   || "1";
                    }
                }

                if (taulmRow.length) {
                    data["F24"]    = taulmRow.find(".fix-free-switch").is(':checked') ? "Free" : "Fix";
                    data["Pval24"] = taulmRow.find(".param-value").val() || "0";
                    data["Pmin24"] = taulmRow.find(".param-min").val()   || "0";
                    data["Pmax24"] = taulmRow.find(".param-max").val()   || "0";
                }
            }

            const isOuterSphereChecked = $(`#outerSphereCheckbox-${profileId}`).is(':checked');
            data["OuterSphere"] = isOuterSphereChecked ? "true" : "false";

            // Outer-Sphere: fn appended AFTER the FLAG slot (last index).
            //   fnIndex = (ModelFree ? 25 : 23) + 1  => 24 (OS only) / 26 (MF + OS)
            // Unchecked => no fn key written.
            if (isOuterSphereChecked) {
                const fnRow = $(`#${profileId} .parameter-input[data-param="fn"]`);
                if (fnRow.length) {
                    const flagIndex = isModelFreeChecked ? 25 : 23;
                    const fnIndex   = flagIndex + 1;
                    data[`F${fnIndex}`]    = fnRow.find(".fix-free-switch").is(':checked') ? "Free" : "Fix";
                    data[`Pval${fnIndex}`] = readValueForPlot(fnRow);
                    data[`Pmin${fnIndex}`] = fnRow.find(".param-min").val() || "0";
                    data[`Pmax${fnIndex}`] = fnRow.find(".param-max").val() || "1";
                }
            }

            const isSecondSphereChecked = $(`#secondSphereCheckbox-${profileId}`).is(':checked');
            data["SecondSphere"] = isSecondSphereChecked ? "true" : "false";

            if (isSecondSphereChecked) {
                const ssStart = ssStartIndex(profileId);
                SS_PARAMS.forEach((p, k) => {
                    data[`F${ssStart + k}`]    = "Fix";
                    data[`Pval${ssStart + k}`] = readValueForPlot(findRow(profileId, p));
                    data[`Pmin${ssStart + k}`] = "";
                    data[`Pmax${ssStart + k}`] = "";
                });
            }

            data["Tags"] = [data["ProfileName"]];
            data["SelectedDataSet"] = data["ProfileName"];

            // IMPORTANT: correct URL (no {profileIndex} literal)
            const saveRequest = $.ajax({
                type: 'POST',
                url: `${SAVE_TAB_DATA_URL}/${tabIndex}`,
                data: JSON.stringify(data),
                contentType: 'application/json'
            });

            saveRequests.push(saveRequest);
            tabIndex++;
        });

        return Promise.all(saveRequests);
    }



    function findLatestFlorenceJsonFile(onFound) {
        $.ajax({
            url: `/files/list`,
            method: 'GET',
            dataType: 'json',
            cache: false,
            success: function (files) {
                const matching = files.filter(f => JSON_FILENAME_RE.test(f));
                if (!matching.length) {
                    const variantLabel = FLORENCE_VARIANT === "modflorence" ? "Modified Florence" : "Florence";
                    alert(`No ${variantLabel} JSON file found.`);
                    return;
                }
                matching.sort().reverse();
                onFound(matching[0]);
            },
            error: function () {
                alert("Error retrieving JSON file list.");
            }
        });
    }

    function applyFlorenceFitFromJson(profileId, data) {

        const FLORENCE_ORDER = [
            {ui: "SI"},                 // 0
            {ui: "gammaI"},             // 1
            {ui: "S"},                  // 2
            {ui: "Delta2"},             // 3  (stored cm-1)
            {ui: "tR"},                 // 4
            {ui: "tv"},                 // 5
            {ui: "tm"},                 // 6
            {ui: "dparam"},             // 7
            {ui: "eparam"},             // 8
            {ui: ["gx", "gxy"]},         // 9
            {ui: "gy"},                 // 10
            {ui: "gz"},                 // 11
            {ui: ["Ax", "Axy"]},         // 12
            {ui: "Ay"},                 // 13
            {ui: "Az"},                 // 14
            {ui: "C"},                  // 15
            {ui: "r"},                  // 16  (stored Å)
            {ui: "a"},                  // 17  (stored Å)
            {ui: "D"},                  // 18
            {ui: "Aoh"},                // 19  (stored internal = UI*Aoh_conv)
            {ui: "q"},                  // 20
            {ui: "thetam"},             // 21
            {ui: "phim"},               // 22
            {ui: "SLS"},                //23
            {ui: "tl"}               //24
        ];

        function findRow(nameOrList) {
            if (Array.isArray(nameOrList)) {
                for (const nm of nameOrList) {
                    const $r = $(`#${profileId} .parameter-input[data-param="${nm}"]`).first();
                    if ($r.length) return $r;
                }
                return $();
            }
            return $(`#${profileId} .parameter-input[data-param="${nameOrList}"]`).first();
        }

        // JSON-stored -> UI conversion (inverse of saveParams_Florence storage rules)
        function storedToUi(paramName, storedVal, $row) {
            if (storedVal === "" || storedVal === null || storedVal === undefined) return "";
            const x = Number(storedVal);
            if (!Number.isFinite(x)) return "";

            const unit = ($row.find('.param-label-dropdown .dropdown-item.active').data('unit') || "").toString();

            if (paramName === "r" || paramName === "r2") {
                // stored Å; UI may be Å or m
                return (unit === "m") ? (x / angstrom) : x;
            }

            if (paramName === "a") {
                // stored m; UI may be Å or m
                return (unit === "A") ? (x * angstrom) : x;
            }

            if (paramName === "Delta2") {
                // stored cm-1; UI may be cm-1 or s-2
                if (unit === "s-2") return Math.pow(x * TWO_PI_c, 2);
                return x; // cm-1 or ts0
            }

            if (paramName === "q" || paramName === "q2") {
                return x / 2;
            }

            if (paramName === "SLS") {

                const unit = ($row.find('.param-label-dropdown .dropdown-item.active')
                    .data('unit') || "").toString();

                if (unit === "sls") {
                    return Math.sqrt(x);
                }

                return x;
            }
            //
            // if (paramName === "Aoh") {
            //     // stored internal; UI shows divided
            //     return x / Aoh_conv;
            // }

            return x;
        }

        function storedErrToUi(paramName, storedErr, storedVal, $row) {
            if (storedErr === "" || storedErr === null || storedErr === undefined) return "";

            const s = String(storedErr).trim().toLowerCase();
            if (s === "fixed" || s === "constant") return "";

            let e = Number(storedErr);
            if (!Number.isFinite(e)) return "";

            const unit = ($row.find('.param-label-dropdown .dropdown-item.active').data('unit') || "").toString();

            if (paramName === "r" || paramName === "r2") {
                return (unit === "m") ? (e / angstrom) : e; // stored Å
            }

            if (paramName === "a") {
                return (unit === "A") ? (e * angstrom) : e; // stored m
            }

            if (paramName === "Delta2") {
                if (unit === "s-2") {
                    const v = Number(storedVal);
                    if (!Number.isFinite(v)) return "";
                    return 2 * v * (TWO_PI_c * TWO_PI_c) * e;
                }
                return e;
            }

            if (paramName === "q" || paramName === "q2") {
                return e / 2;
            }

            if (paramName === "SLS") {

                const unit = ($row.find('.param-label-dropdown .dropdown-item.active')
                    .data('unit') || "").toString();

                if (unit === "sls") {
                    return Math.sqrt(e);
                }

                return e;
            }

            return e;
        }

        for (let i = 0; i < FLORENCE_ORDER.length; i++) {
            const spec = FLORENCE_ORDER[i];
            const $row = findRow(spec.ui);
            if (!$row.length) continue;

            const paramName = Array.isArray(spec.ui) ? String(spec.ui[0]) : String(spec.ui);

            const pval = data[`Pval${i}`];
            const pmin = data[`Pmin${i}`];
            const pmax = data[`Pmax${i}`];

            const uiVal = storedToUi(paramName, pval, $row);
            const uiMin = storedToUi(paramName, pmin, $row);
            const uiMax = storedToUi(paramName, pmax, $row);

            $row.find('.param-value').val(uiVal === "" ? "" : formatValue(uiVal));
            $row.find('.param-min').val(uiMin === "" ? "" : formatValue(uiMin));
            $row.find('.param-max').val(uiMax === "" ? "" : formatValue(uiMax));
        }

        {
            const $fnRow = findRow("fn");
            if ($fnRow.length) {
                const isMF    = $(`#modelFreeCheckbox-${profileId}`).is(':checked');
                const fnIndex = (isMF ? 25 : 23) + 1;

                const fnVal = storedToUi("fn", data[`Pval${fnIndex}`], $fnRow);
                const fnMin = storedToUi("fn", data[`Pmin${fnIndex}`], $fnRow);
                const fnMax = storedToUi("fn", data[`Pmax${fnIndex}`], $fnRow);

                $fnRow.find('.param-value').val(fnVal === "" ? "" : formatValue(fnVal));
                $fnRow.find('.param-min').val(fnMin === "" ? "" : formatValue(fnMin));
                $fnRow.find('.param-max').val(fnMax === "" ? "" : formatValue(fnMax));
            }
        }

        if ($(`#secondSphereCheckbox-${profileId}`).is(':checked')) {
            const ssStart = ssStartIndex(profileId);
            SS_PARAMS.forEach((p, k) => {
                const $row = findRow(p);
                if (!$row.length) return;
                const v    = storedToUi(p, data[`Pval${ssStart + k}`], $row);
                const vmin = storedToUi(p, data[`Pmin${ssStart + k}`], $row);
                const vmax = storedToUi(p, data[`Pmax${ssStart + k}`], $row);
                $row.find('.param-value').val(v === "" ? "" : formatValue(v));
                $row.find('.param-min').val(vmin === "" ? "" : formatValue(vmin));
                $row.find('.param-max').val(vmax === "" ? "" : formatValue(vmax));
            });
        }

        const fitResults = data && data["fit-results"];
        if (typeof fitResults === "string") {

            const lines = fitResults.trim().split(/\r?\n/);

            if (lines.length >= 2) {
                const tokens = lines[1].split(",").map(s => s.trim());

                const hdr = lines[0].replace(/^#\s*/, '').split(",").map(s => s.trim());
                let startCol = 5;
                for (let k = 0; k < hdr.length - 1; k++) {
                    if (hdr[k + 1].indexOf('err') !== -1) { startCol = k; break; }
                }

                let col = startCol;

                for (let i = 0; i < FLORENCE_ORDER.length; i++) {

                    const spec = FLORENCE_ORDER[i];
                    const $row = findRow(spec.ui);

                    const storedVal = tokens[col];
                    const storedErr = tokens[col + 1];
                    col += 2;

                    if (!$row.length) continue;

                    const paramName = Array.isArray(spec.ui)
                        ? String(spec.ui[0])
                        : String(spec.ui);

                    const errUi = storedErrToUi(
                        paramName,
                        storedErr,
                        storedVal,
                        $row
                    );

                    if (typeof errUi === "number") {
                        $row.find('.param-error').val(formatValue(errUi));
                    } else {
                        $row.find('.param-error').val("");
                    }
                }


                const $fnRow = findRow("fn");
                if ($fnRow.length) {
                    const isMF    = $(`#modelFreeCheckbox-${profileId}`).is(':checked');
                    const fnIndex = (isMF ? 25 : 23) + 1;
                    const fnCol   = startCol + 2 * fnIndex;

                    const fnStoredVal = tokens[fnCol];
                    const fnStoredErr = tokens[fnCol + 1];

                    const fnErrUi = storedErrToUi("fn", fnStoredErr, fnStoredVal, $fnRow);
                    $fnRow.find('.param-error').val(
                        typeof fnErrUi === "number" ? formatValue(fnErrUi) : ""
                    );
                }

                if ($(`#secondSphereCheckbox-${profileId}`).is(':checked')) {
                    const ssStart = ssStartIndex(profileId);
                    SS_PARAMS.forEach((p, k) => {
                        const $row = findRow(p);
                        if (!$row.length) return;
                        const c = startCol + 2 * (ssStart + k);
                        const errUi = storedErrToUi(p, tokens[c + 1], tokens[c], $row);
                        $row.find('.param-error').val(typeof errUi === "number" ? formatValue(errUi) : "");
                    });
                }
            }
        }

        if (typeof fitResults === "string") {

            const lines = fitResults.trim().split(/\r?\n/);

            if (lines.length >= 2) {
                const tokens = lines[1].split(",").map(s => s.trim());

                const R2   = tokens[2]; // 3rd value
                const chi2 = tokens[3]; // 4th value

                const $box = $(`#fit-quality-${profileId}`);

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
        }

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
                            ? parseFitCurvesISOS(data["fit-curves"])
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


        if (mode === "compare" && fitCurvesData && fitCurvesData.IS && fitCurvesData.OS) {
            traces.push({
                x: fitCurvesData.IS.map(p => p.x),
                y: fitCurvesData.IS.map(p => p.y),
                mode: 'lines',
                type: 'scatter',
                name: 'IS',
                line: { dash: 'solid', width: 2 }
            });
            traces.push({
                x: fitCurvesData.OS.map(p => p.x),
                y: fitCurvesData.OS.map(p => p.y),
                mode: 'lines',
                type: 'scatter',
                name: 'OS',
                line: { dash: 'dot', width: 2 }
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
            title: { text: `NMRD Profile and Fit` },
            // title: { text: `NMRD Profiles for ${activeTabId}` },
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



    function parseFitCurvesISOS(fitCurvesArray) {
        const IS = [];
        const OS = [];

        fitCurvesArray.forEach(dataString => {
            const lines = dataString.replace(/\\n/g, '\n').trim().split("\n");
            lines.forEach(line => {
                const trimmed = line.trim();
                if (trimmed === '' || trimmed.startsWith('#')) return;

                const parts = trimmed.split(/\s+/).map(Number);
                const x = parts[0], y1 = parts[1], y2 = parts[2];

                if (!isNaN(x) && !isNaN(y1)) IS.push({ x, y: y1 });
                if (!isNaN(x) && !isNaN(y2)) OS.push({ x, y: y2 });
            });
        });

        return { IS, OS };
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
$('#submit-button').on('click', saveParams_Florence);
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

        function getCheckedFitMethods() {
            const map = {
                'simp-check':  'simp',
                'scan-check':  'scan',
                'min-check':   'migrad',
                'minos-check': 'minos'
            };
            return Object.keys(map).filter(id => $('#' + id).is(':checked')).map(id => map[id]);
        }

        $('#fit-button').off('click').on('click', function () {
            console.log("Saving data before fitting.");
            setFitUiDisabled(true);
            setSpinnerVisible(true);

            // Save → Fit → Update UI
            saveParams_Florence()
                .then(() => {
                    console.log("Saving complete. Starting fit process...");
                    return $.ajax({ url: FIT_URL, method: 'POST',
                        data: { methods: getCheckedFitMethods() }, traditional: true });                })
                .then(() => {
                    // Fit completed; now load the fitted JSON file and update UI from it
                    findLatestFlorenceJsonFile(function (latestFile) {
                        $.ajax({
                            url: `/files/${latestFile}?timestamp=${new Date().getTime()}`,
                            method: 'GET',
                            dataType: 'json',
                            cache: false,
                            success: function (data) {

                                // Apply values/min/max/errors to ALL open tabs (same fitted vector)
                                $('.tab-pane').each(function () {
                                    const profileId = $(this).attr('id');
                                    applyFlorenceFitFromJson(profileId, data);

                                    $(`#${profileId}-plots-container`).css('visibility', 'visible');
                                    setAxisScaleUIVisible(profileId, true);


                                    // Your plotting function expects a per-profile filename;
                                    // with Florence it’s one file for all, so just use latestFile
                                    fetchDataAndPlot(latestFile, profileId, "fit");
                                });
                            }
                        });
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

        // (function () {
        //     let isCompareMode = false;
        //
        //     // $('#switch-plot').off('click').on('click', function () {
        //     //     const activeTabId = $('#myTabContent .tab-pane.active').attr('id');
        //     //     const plotContainer = $(`#${activeTabId}-plots-container`);
        //     //
        //     //     // Toggle mode
        //     //     isCompareMode = !isCompareMode;
        //     //
        //     //     plotContainer.css('visibility', 'visible');
        //     //
        //     //     if (isCompareMode) {
        //     //         findLatestJsonFile(activeTabId, "compare");
        //     //     } else {
        //     //         findLatestJsonFile(activeTabId, "fit");
        //     //     }
        //     // });
        // })();

        $('#plot-button').on('click', function () {
            const activeTabId = $('#myTabContent .tab-pane.active').attr('id');
            const $fitBox = $(`#fit-quality-${activeTabId}`);
            if ($fitBox.length && $fitBox.html().trim() !== "") {
                $fitBox.toggleClass('d-none');
            }
            setFitUiDisabled(true);
            setSpinnerVisible(true);

            saveForPlot_Florence()
                .then(() => {
                    console.log("Saving complete. Starting fit process...");

                    return $.ajax({
                        url: FIT_URL,
                        method: 'POST',
                        data: { methods: getCheckedFitMethods() },
                        traditional: true
                    });
                })
                .then(response => {
                    const activeTabId = $('#myTabContent .tab-pane.active').attr('id');
                    console.log("Plot button clicked for tab:", activeTabId);
                    $(`#${activeTabId}-plots-container`).css('visibility', 'visible');
                    setAxisScaleUIVisible(activeTabId, true);
                    findLatestFlorenceJsonFile(function (latestFile) {
                        fetchDataAndPlot(latestFile, activeTabId, "plot");
                    });
                })
                .finally(() => {
                    setSpinnerVisible(false);
                    setFitUiDisabled(false);
                });
        });

        $('#switch-plot').hide().prop('disabled', true);

        // Show or hide the C button based on the active tab's Outer Sphere checkbox
        $(document).on('shown.bs.tab change', 'a[data-toggle="tab"], [id^="outerSphereCheckbox-"]', function () {
            const activeTab = $('#myTabContent .tab-pane.active').attr('id');
            const isOSChecked = $(`#outerSphereCheckbox-${activeTab}`).is(':checked');

            $('#switch-plot').toggle(isOSChecked).prop('disabled', !isOSChecked);
        });

        $('#cancel-fit-button').off('click').on('click', function () {
            __cancelAjax.abortAll();

            $.ajax({ url: '/fit_cancel', method: 'POST' });

            // 3) Restore UI now
            $('#fit-spinner-overlay').addClass('d-none').removeClass('d-flex');
            $('#fit-button, #plot-button, #switch-plot, #close-plot').prop('disabled', false);

            console.log('[CANCEL] universal abort triggered');
        });


    });


});

$('[data-toggle="tooltip"]').tooltip(); // Initialize tooltips for the first time

function enableTabRename(profileId, tabNameElement) {
    const currentName = tabNameElement.text();
    const inputField = $(`<input type="text" class="form-control rename-input" value="${currentName}" style="width: auto; display: inline-block;">`);
    tabNameElement.replaceWith(inputField);

    inputField.focus();

    inputField.on('blur', function () {
        const newName = $(this).val();
        inputField.replaceWith(`<span id="${profileId}-name" class="tab-name">${newName}</span>`);
        updateTabSelectOptions(); // Update the new select element after renaming
    });

    inputField.on('keypress', function (e) {
        if (e.which == 13) { // Enter key pressed
            const newName = $(this).val();
            inputField.replaceWith(`<span id="${profileId}-name" class="tab-name">${newName}</span>`);
            updateTabSelectOptions(); // Update the new select element after renaming
        }
    });
}

$(document).on('click', '.editable-profile-name', function () {
    const profileId = $(this).data('profile');
    const tabNameElement = $(`#${profileId}-name`);
    enableTabRename(profileId, tabNameElement);
});

(function () {

    window.__indieExportCache = window.__indieExportCache || {}; // { profileId: { fitX:[], fitY:[], fitY1:[], fitY2:[], chi2:'', R2:'' } }

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
        const mode = 'florence';
        const profileName = getActiveProfileName(profileId);
        const filename = `${ts}_${mode}_${profileName}.csv`;

        // Params in DOM order for this tab only
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
        // E chi2 (row 2 only)
        // F R2   (row 2 only)
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
                '', '',                 // G-H
                fx,                     // I
                fy1,                    // J
                (fit.hasTwo ? fy2 : ''),// K
                '', '',                 // L-M
                dx, dy, de              // N-O-P
            ];

            lines.push(rowToCsv(row));
        }

        const csvText = lines.join('\n') + '\n';
        const blob = new Blob([csvText], { type: 'text/csv;charset=utf-8' });
        downloadBlob(blob, filename);
    }

    $(document)
        .off('click.exportCsvFlorenceIndie', '#export-button')
        .on('click.exportCsvFlorenceIndie', '#export-button', function (e) {
            e.preventDefault();
            e.stopPropagation();
            exportParametersCsv();
        });

})();

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



