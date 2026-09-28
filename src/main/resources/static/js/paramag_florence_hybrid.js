// -----------------------------------------------------------------------------
// Variant detection: the same script powers both /florence-indie and
// /modflorence-indie pages. Everything variant-specific (save URL, fit URL,
// filename pattern) is derived here from window.location.pathname.
// -----------------------------------------------------------------------------
const FLORENCE_VARIANT = window.location.pathname.includes("modflorence") ? "modflorence" : "florence";

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
    const sharedState = {};
    let sharedTextDirty = false;
    let __progSharedUpdate = false;
    const DmodeState = { D: "X" };
    let __syncingDmode = false;

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



        // MAIN PARAMETERS --------------------------------------------------------
        const parametersContainer = $(`#${profileId}-parameters`);
        const SHARED_PAR = ['q', 'r', 'tm', 'tR', 'tv', 'Delta2', 'Aoh', 'a', 'SLS', 'thetam'];

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

            const sharedCheckbox = SHARED_PAR.includes(param.name)
                ? `
            <div class="form-check form-check-inline ms-1">
                <input class="form-check-input shared-checkbox" type="checkbox"
                       id="${profileId}-${param.name}-shared" data-param="${param.name}">
                <label class="form-check-label" for="${profileId}-${param.name}-shared">Shared</label>
            </div>` : '';


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
                ${sharedCheckbox}


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
                <div class="form-check form-check-inline ms-1">
                    <input class="form-check-input shared-checkbox" type="checkbox" id="${profileId}-Aoh-shared" data-param="Aoh">
                    <label class="form-check-label" for="${profileId}-Aoh-shared">Shared</label>
                </div>


            </div>`;
            container.html(html);
            applySharedStateToProfile(profileId);
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
                <div class="form-check form-check-inline ms-1">
                    <input class="form-check-input shared-checkbox" type="checkbox" id="${profileId}-q2-shared" data-param="q2">
                    <label class="form-check-label" for="${profileId}-q2-shared">Shared</label>
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
                <div class="form-check form-check-inline ms-1">
                    <input class="form-check-input shared-checkbox" type="checkbox" id="${profileId}-tm2-shared" data-param="tm2">
                    <label class="form-check-label" for="${profileId}-tm2-shared">Shared</label>
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
                <div class="form-check form-check-inline ms-1">
                    <input class="form-check-input shared-checkbox" type="checkbox" id="${profileId}-r2-shared" data-param="r2">
                    <label class="form-check-label" for="${profileId}-r2-shared">Shared</label>
                </div>
            </div>
        `);
            applySharedStateToProfile(profileId);
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
                    <span class="input-group-text d-label-static">D</span>

                    <div class="input-group-text dropdown param-label-dropdown d-label-dropdown" style="display:none;">
                        <button class="btn btn-sm btn-light dropdown-toggle" type="button" data-bs-toggle="dropdown">
                            D
                        </button>
                        <ul class="dropdown-menu">
                            <li><a class="dropdown-item active" href="#" data-mode="X">D-General</a></li>
                            <li><a class="dropdown-item" href="#" data-mode="Y">D-Discrete</a></li>
                        </ul>
                    </div>

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
                <div class="form-check form-check-inline ms-1">
                    <input class="form-check-input shared-checkbox" type="checkbox" id="${profileId}-D-shared" data-param="D">
                    <label class="form-check-label" for="${profileId}-D-shared">Shared</label>
                </div>


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
                <div class="form-check form-check-inline ms-1">
                    <input class="form-check-input shared-checkbox" type="checkbox" id="${profileId}-a-shared" data-param="a">
                    <label class="form-check-label" for="${profileId}-a-shared">Shared</label>
                </div>

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
            applySharedStateToProfile(profileId);
            applyDmodeToProfile(profileId);
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
                <div class="form-check form-check-inline ms-1">
                    <input class="form-check-input shared-checkbox" type="checkbox" id="${profileId}-SLS-shared" data-param="SLS">
                    <label class="form-check-label" for="${profileId}-SLS-shared">Shared</label>
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
            applySharedStateToProfile(profileId);
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
            const isFixedByDefault = ["gxy", "gz"].includes(paramName);
            const sharedCheckbox = ["thetam", "phim", "dparam", "eparam"].includes(paramName) ? `
            <div class="form-check form-check-inline ms-1">
                <input class="form-check-input shared-checkbox" type="checkbox" id="${profileId}-${paramName}-shared" data-param="${paramName}">
                <label class="form-check-label" for="${profileId}-${paramName}-shared">Shared</label>
            </div>` : '';
            return `
        <div class="parameter-input mb-3" data-param="${paramName}">
            <div class="input-group">
                <span class="input-group-text">${labelHTML}</span>
        
                <span class="input-group-text p-0 switch-cell">
                    <div class="form-check form-switch ms-2 me-2 my-1">
                        <input class="form-check-input fix-free-switch" type="checkbox"
                               id="switch${paramName}-${profileId}" ${isFixedByDefault ? "" : "checked"}>
                        <label class="form-check-label ms-2" for="switch${paramName}-${profileId}">${isFixedByDefault ? "Fix" : "Free"}</label>
                    </div>
                </span>
        
                <input type="text" class="form-control param-value" placeholder="${placeholderText}">
                <input type="text" class="form-control param-error" placeholder="Error" readonly>
                <input type="text" class="form-control param-min" placeholder="min" value="${minVal}">
                <input type="text" class="form-control param-max" placeholder="max" value="${maxVal}">
            </div>
            ${sharedCheckbox}
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
                    applySharedStateToProfile(profileId);
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
                    applySharedStateToProfile(profileId);
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


    $(document).on('change', '.fix-free-switch', function () {
        const isChecked = $(this).is(':checked');
        const labelElement = $(this).next('label');
        labelElement.text(isChecked ? 'Free' : 'Fix');

        const $row = $(this).closest('.parameter-input');
        if ($row.data('param') === 'D') {
            if (isChecked) {
                $row.find('.d-label-static').show();
                $row.find('.d-label-dropdown').hide();
            } else {
                $row.find('.d-label-static').hide();
                $row.find('.d-label-dropdown').show();
            }
        }
    });

    function applySharedStateToProfile(profileId) {
        $(`#${profileId} .shared-checkbox`).each(function () {
            const p = $(this).data('param');
            if (sharedState.hasOwnProperty(p)) {
                $(this).prop('checked', !!sharedState[p]);
            }
        });
    }

    $(document).on('change', '.shared-checkbox', function () {
        const param = String($(this).data('param'));
        const isChecked = $(this).is(':checked');
        sharedState[param] = !!isChecked;
        $(`.shared-checkbox[data-param="${param}"]`).prop('checked', !!isChecked);
    });

    function syncDistreteD(mode) {
        DmodeState.D = mode;
        __syncingDmode = true;
        try {
            $('.parameter-input[data-param="D"] .d-label-dropdown').each(function () {
                const $menu = $(this);
                $menu.find('.dropdown-item').removeClass('active')
                    .filter(`[data-mode="${mode}"]`).addClass('active');
                $menu.find('button').html($menu.find('.dropdown-item.active').html());
            });
        } finally { __syncingDmode = false; }
    }

    function applyDmodeToProfile(profileId) {
        const $dropdown = $(`#${profileId} .parameter-input[data-param="D"] .d-label-dropdown`);
        $dropdown.find('.dropdown-item').removeClass('active')
            .filter(`[data-mode="${DmodeState.D}"]`).addClass('active');
        $dropdown.find('button').html($dropdown.find('.dropdown-item.active').html());
    }

    $(document).on('click', '.d-label-dropdown .dropdown-item', function (e) {
        e.preventDefault();
        const $item = $(this);
        const $menu = $item.closest('.param-label-dropdown');
        $menu.find('.dropdown-item').removeClass('active');
        $item.addClass('active');
        $menu.find('button').html($item.html());

        if (__syncingDmode) return;
        syncDistreteD($item.data('mode'));
    });


    // Make the open dropdown row overlap neighbors (like _corr.js)
    $(document).on('shown.bs.dropdown', '.param-label-dropdown', function () {
        $(this).closest('.parameter-input').addClass('z-top');
    });
    $(document).on('hidden.bs.dropdown', '.param-label-dropdown', function () {
        $(this).closest('.parameter-input').removeClass('z-top');
    });

    createParameterFields('profile1');

    const sharedAccordion = `
      <div id="shared-accordion-wrapper" style="width:50%; margin-top:12px;">
        <div class="accordion" id="shared-accordion">
          <div class="card">
            <div class="card-header" id="shared-heading">
              <h2 class="mb-0">
                <button class="btn btn-link btn-block text-left" type="button"
                  data-toggle="collapse" data-target="#shared-collapse"
                  aria-expanded="true" aria-controls="shared-collapse">
                  Input Data
                </button>
              </h2>
            </div>
            <div id="shared-collapse" class="collapse show" aria-labelledby="shared-heading" data-parent="#shared-accordion">
              <div class="card-body">
                <textarea class="form-control mb-3 resizable-input narrow-input"
                  id="shared-textarea"
                  placeholder="Enter data for all profiles"
                  style="height:100px; width:95%;"></textarea>
              </div>
            </div>
          </div>
        </div>
      </div>`;

    $('.tabs-container').after(sharedAccordion);

    function updateSharedTextarea() {
        const $textarea = $('#shared-textarea');
        if ($textarea.length === 0) return;

        let text = '';
        for (let i = 1; i <= profileCount; i++) {
            text += `# TAG = Profile ${i}\n# UNIT = MHz\n<Add input here>\n\n`;
        }

        __progSharedUpdate = true;
        $textarea.val(text.trim());
        __progSharedUpdate = false;
    }

    updateSharedTextarea();

    $('#shared-textarea').on('input', function () {
        if (__progSharedUpdate) return;
        sharedTextDirty = true;
    });

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
        applySharedStateToProfile(`profile${profileCount}`);
        applyDmodeToProfile(`profile${profileCount}`);

        (function () {
            const $textarea = $('#shared-textarea');
            if (!$textarea.length) return;
            if (sharedTextDirty) return;

            const i = profileCount;
            const block =
                `# TAG = Profile ${i}\n` +
                `# UNIT = MHz\n` +
                `<Add input here>\n\n`;

            const current = $textarea.val();
            const separator = current && !current.endsWith('\n\n') ? '\n\n' : '';

            __progSharedUpdate = true;
            $textarea.val((current || '') + separator + block);
            __progSharedUpdate = false;
        })();
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

    });


    $(document).on('click', '.toggle-parameters', function () {
        const profileId = $(this).data('profile');
        const parametersToToggle = $(`#${profileId} .parameter-input[data-param="q"], #${profileId} .parameter-input[data-param="C"], #${profileId} .parameter-input[data-param="gammaI"], #${profileId} .parameter-input[data-param="r"], #${profileId} .parameter-input[data-param="S"]`);

        parametersToToggle.toggle();

        // Toggle button text
        const buttonText = $(this).text() === 'Hide System Parameters' ? 'Show System Parameters' : 'Hide System Parameters';
        $(this).text(buttonText);
    });

    const TWO_PI_c = 2 * 29979245800 * Math.PI;


    function saveParams_FlorenceHybrid(isPlot = false) {
        const profileId = $('#myTabContent .tab-pane.active').attr('id');
        if (!profileId) {
            console.warn('[florence-hybrid] No active tab found.');
            return Promise.reject('No active tab');
        }

        const isModelFreeChecked    = $(`#modelFreeCheckbox-${profileId}`).is(':checked');
        const isOuterSphereChecked  = $(`#outerSphereCheckbox-${profileId}`).is(':checked');
        const isSecondSphereChecked = $(`#secondSphereCheckbox-${profileId}`).is(':checked');
        const isDdiscrete           = isOuterSphereChecked && DmodeState.D === "Y";

        // Parameter order: Florence > Lipari-Szabo > SS
        const ORDER = [
            { label: "SI",       ui: "SI",          group: "hyperfine" },  // 0
            { label: "GAMMAI",   ui: "gammaI" },                           // 1
            { label: "SPIN",     ui: "S" },                                // 2
            { label: "DELTA2",   ui: "Delta2" },                           // 3
            { label: "TAURM",    ui: "tR" },                               // 4
            { label: "TAUVM",    ui: "tv" },                               // 5
            { label: "TAUMM",    ui: "tm" },                               // 6
            { label: "DPARAM",   ui: "dparam",      group: "static" },     // 7
            { label: "EPARAM",   ui: "eparam",      group: "static" },     // 8
            { label: "GXM",      ui: ["gx", "gxy"], group: "gtensor" },    // 9
            { label: "GYM",      ui: ["gy", "gxy"], group: "gtensor" },    // 10 (axial: gxy)
            { label: "GZM",      ui: "gz",          group: "gtensor" },    // 11
            { label: "AXM",      ui: ["Ax", "Axy"], group: "hyperfine" },  // 12
            { label: "AYM",      ui: ["Ay", "Axy"], group: "hyperfine" },  // 13 (axial: Axy)
            { label: "AZM",      ui: "Az",          group: "hyperfine" },  // 14
            { label: "CONCM",    ui: "C" },                                // 15
            { label: "RKM",      ui: "r" },                                // 16
            { label: "DM",       ui: "a" },                                // 17
            { label: "DDM",      ui: "D" },                                // 18 (removed when D discrete)
            { label: "ACONTM",   ui: "Aoh" },                              // 19
            { label: "AMOLFRAM", ui: "q" },                                // 20
            { label: "THETAM",   ui: "thetam",      group: "angles" },     // 21
            { label: "PHIM",     ui: "phim",        group: "angles" },     // 22
            { label: "FLAG",     special: "flag" },                        // 23 (value set in Java)
            { label: "FN",       ui: "fn", def: 1 }                        // 24
        ];

        if (isModelFreeChecked) {
            ORDER.push(
                { label: "SLS",   ui: "SLS" },
                { label: "TAULM", ui: "tl" }
            );
        }

        if (isSecondSphereChecked) {
            ORDER.push(
                { label: "TAUMM2",    ui: "tm2" },
                { label: "RKM2",      ui: "r2" },
                { label: "AMOLFRAM2", ui: "q2" }
            );
        }

        // D discrete: DDM removed, all following indexes shift down by 1
        if (isDdiscrete) {
            ORDER.splice(ORDER.findIndex(s => s.label === "DDM"), 1);
        }

        function getZfsClosedMap(pid) {
            const isOff = (sel) => {
                const $c = $(sel);
                return ($c.length === 0 || !$c.is(':checked'));
            };
            return {
                angles:    isOff(`#zfsAnglesChk-${pid}`),
                static:    isOff(`#zfsStaticChk-${pid}`),
                gtensor:   isOff(`#zfsGTensorChk-${pid}`),
                hyperfine: isOff(`#zfsHyperfineChk-${pid}`)
            };
        }

        function findRow(pid, nameOrList) {
            const names = Array.isArray(nameOrList) ? nameOrList : [nameOrList];
            for (const nm of names) {
                const $r = $(`#${pid} .parameter-input[data-param="${nm}"]`).first();
                if ($r.length) return $r;
            }
            return $();
        }

        function readRow($row) {
            const $val = $row.find('.param-value').first();
            const $min = $row.find('.param-min').first();
            const $max = $row.find('.param-max').first();

            const rawVal = ($val.val() ?? "").toString().trim();
            const rawMin = ($min.val() ?? "").toString().trim();
            const rawMax = ($max.val() ?? "").toString().trim();

            let v    = rawVal === "" ? 0 : parseFloat(rawVal);
            let vmin = rawMin === "" ? "" : parseFloat(rawMin);
            let vmax = rawMax === "" ? "" : parseFloat(rawMax);

            const paramName = String($row.data('param') || "");
            const unit = String($row.find('.param-label-dropdown .dropdown-item.active').first().data('unit') || '');

            const conv = (x) => {
                if (x === "" || !Number.isFinite(x)) return "";
                if (paramName === "r" || paramName === "r2") return (unit === "m") ? (x * angstrom) : x;  // m -> Å
                if (paramName === "a")                        return (unit === "A") ? (x / angstrom) : x;  // Å -> m
                if (paramName === "q" || paramName === "q2")  return 2 * x;
                if (paramName === "Delta2")                   return (unit === "s-2") ? (Math.sqrt(x) / TWO_PI_c) : x;
                if (paramName === "SLS")                      return (unit === "sls") ? (x * x) : x;
                return x;
            };

            const isFree = $row.find('.fix-free-switch').is(':checked');
            return { F: isFree ? "Free" : "Fix", Pval: conv(v), Pmin: conv(vmin), Pmax: conv(vmax) };
        }

        const sharedSet = new Set($('.shared-checkbox:checked').map(function () {
            return String($(this).data('param'));
        }).get());

        const zfsClosed = getZfsClosedMap(profileId);
        const data = {};
        const labels = [];

        ORDER.forEach((spec, i) => {
            let F = "Fix", Pval = 0, Pmin = "", Pmax = "", label = spec.label;

            if (spec.special === "flag") {
                Pval = "";                                   // overwritten in Java (ModelFlag)
            } else if (spec.group && zfsClosed[spec.group]) {
                Pval = (spec.group === "gtensor") ? 2.0023 : 0;
            } else {
                const $row = findRow(profileId, spec.ui);
                if (!$row.length) {
                    Pval = (spec.def !== undefined) ? spec.def : 0;
                } else {
                    const vv = readRow($row);
                    Pval = vv.Pval; Pmin = vv.Pmin; Pmax = vv.Pmax;
                    F = vv.F;

                    // _corr rule: shared -> plain label; not shared + Free -> per dataset ("_")
                    if (!sharedSet.has(String($row.data('param'))) && F === "Free") {
                        label = `${spec.label}_`;
                    }
                }
            }

            // Plot mode: everything Fix, plain labels
            if (isPlot) {
                F = "Fix";
                label = spec.label;
            }

            data[`F${i}`]    = F;
            data[`Pval${i}`] = Pval;
            data[`Pmin${i}`] = Pmin;
            data[`Pmax${i}`] = Pmax;
            labels.push(label);
        });

        data["Parameters"]       = labels;
        data["ParametersString"] = labels.join(",");

        // ---- Dados: shared textarea, unit pre-scale, "# DATA N=idx idx [D]" (as _corr) ----
        const lines = ($('#shared-textarea').val() || "").split(/\r?\n/);

        let unitFactor = 1;
        const unitLine = lines.find(line => line.trim().toUpperCase().startsWith("# UNIT ="));
        if (unitLine) {
            const unit = unitLine.split("=")[1]?.trim().toUpperCase();
            if (unit === "MHZ") unitFactor = 1e6;
            else if (unit === "HZ") unitFactor = 1;
        }

        const processedLines = lines.map(line => {
            const t = line.trim();
            if (t === "" || t.startsWith("#")) return t;
            const parts = t.split(/\s+/);
            if (!isNaN(parseFloat(parts[0]))) parts[0] = String(parseFloat(parts[0]) * unitFactor);
            if (parts.length === 2) {
                const y = parseFloat(parts[1]);
                if (!isNaN(y)) parts.push(Number((0.1 * y).toPrecision(6)).toString());
            }
            return parts.join(" ");
        });

        const Dvals = $('#myTabContent .tab-pane').map(function () {
            return ($(`#${this.id} .parameter-input[data-param="D"] .param-value`).val() || "").trim();
        }).get();

        const out = [];
        let counter = 0;
        for (const ln of processedLines) {
            if (ln.startsWith("# TAG")) {
                counter++;
                out.push(isDdiscrete
                    ? `# DATA N=${counter} ${counter} ${Dvals[counter - 1] || ""}`
                    : `# DATA N=${counter} ${counter}`);
            }
            out.push(ln);
        }
        data["dados"] = out.join("\n");

        // ---- flags / tabs ----
        data["ProfileName"]  = $(`#${profileId}-name`).text().trim();
        data["ModelFree"]    = isModelFreeChecked ? "true" : "false";
        data["OuterSphere"]  = isOuterSphereChecked ? "true" : "false";
        data["SecondSphere"] = isSecondSphereChecked ? "true" : "false";
        data["Dmode"]        = DmodeState.D;
        data["Variant"]      = FLORENCE_VARIANT;
        data["FitType"]      = "Individual";

        data["AllTabs"] = $('.nav-tabs .nav-link').map(function () {
            const name = $(this).find('[id$="-name"]').first().text().trim();
            return name || null;
        }).get();
        data["ActiveTab"] = data["ProfileName"] || profileId;

        return $.ajax({
            type: 'POST',
            url: `/saveTabData_florence_hybrid`,
            data: JSON.stringify(data),
            contentType: 'application/json'
        });
    }

    let __corrLastFitJson = null;

    const FL_LABEL_TO_UI = {
        // Florence
        SI:        "SI",
        GAMMAI:    "gammaI",
        SPIN:      "S",
        DELTA2:    "Delta2",
        TAURM:     "tR",
        TAUVM:     "tv",
        TAUMM:     "tm",
        DPARAM:    "dparam",
        EPARAM:    "eparam",
        GXM:       ["gx", "gxy"],
        GYM:       "gy",
        GZM:       "gz",
        AXM:       ["Ax", "Axy"],
        AYM:       "Ay",
        AZM:       "Az",
        CONCM:     "C",
        RKM:       "r",
        DM:        "a",
        DDM:       "D",
        ACONTM:    "Aoh",
        AMOLFRAM:  "q",
        THETAM:    "thetam",
        PHIM:      "phim",
        FN:        "fn",

        // Lipari-Szabo
        SLS:       "SLS",
        TAULM:     "tl",

        // Second sphere
        TAUMM2:    "tm2",
        RKM2:      "r2",
        AMOLFRAM2: "q2"
    };

    function findUiRowByLabel($tab, label) {
        const key = String(label || '').trim().replace(/_$/, '');
        for (const name of [].concat(FL_LABEL_TO_UI[key] || [])) {
            const $row = $tab.find(`.parameter-input[data-param="${name}"]`).first();
            if ($row.length) return $row;
        }
        return $();
    }

    function rowUnit($row) {
        return String($row.find('.param-label-dropdown .dropdown-item.active').first().data('unit') || '');
    }

    // stored (JSON) -> UI value; inverse of readRow() in saveParams_FlorenceHybrid
    function convForUi(paramName, raw, $row) {
        if (raw === '' || raw == null) return '';
        const x = Number(raw);
        if (!Number.isFinite(x)) return '';
        const unit = rowUnit($row);

        if (paramName === "r" || paramName === "r2") return (unit === "m") ? (x / angstrom) : x;       // stored Å
        if (paramName === "a")                        return (unit === "A") ? (x * angstrom) : x;       // stored m
        if (paramName === "q" || paramName === "q2")  return x / 2;
        if (paramName === "Delta2")                   return (unit === "s-2") ? Math.pow(x * TWO_PI_c, 2) : x; // stored cm-1
        if (paramName === "SLS")                      return (unit === "sls") ? Math.sqrt(Math.max(x, 0)) : x; // stored S²
        return x;
    }

    // stored (JSON) error -> UI error (needs stored value for non-linear units)
    function convErrForUi(paramName, rawErr, rawVal, $row) {
        if (rawErr === '' || rawErr == null) return '';
        const s = String(rawErr).trim().toLowerCase();
        if (s === 'fixed' || s === 'constant') return '';
        const e = Number(rawErr);
        if (!Number.isFinite(e)) return '';
        const v = Number(rawVal);
        const unit = rowUnit($row);

        if (paramName === "r" || paramName === "r2") return (unit === "m") ? (e / angstrom) : e;
        if (paramName === "a")                        return (unit === "A") ? (e * angstrom) : e;
        if (paramName === "q" || paramName === "q2")  return e / 2;
        if (paramName === "Delta2") {
            if (unit !== "s-2") return e;
            return Number.isFinite(v) ? 2 * v * TWO_PI_c * TWO_PI_c * e : '';
        }
        if (paramName === "SLS") {
            if (unit !== "sls") return e;
            return (Number.isFinite(v) && v > 0) ? e / (2 * Math.sqrt(v)) : '';
        }
        return e;
    }

    const toExp5 = (v) => {
        if (v === '' || v == null) return '';
        const n = Number(v);
        if (!Number.isFinite(n)) return String(v);
        return n.toExponential(5).replace(/e\+?(-?\d+)/i, 'e$1');
    };

    function updateHybridFitQuality(profileId, fitJson, tabIdx) {
        const fitResults = fitJson && fitJson["fit-results"];
        if (typeof fitResults !== "string") return;

        const lines = fitResults.trim().split(/\r?\n/);
        if (lines.length < 2) return;

        let dataLineIndex = 1;
        if (typeof tabIdx === "number" && tabIdx >= 0 && (tabIdx + 1) < lines.length) {
            dataLineIndex = tabIdx + 1;
        }

        const line = lines[dataLineIndex];
        if (!line) return;

        const tokens = line.split(",").map(s => s.trim());
        if (tokens.length < 4) return;

        const R2   = Number(tokens[2]);
        const chi2 = Number(tokens[3]);

        const $box = $(`#fit-quality-${profileId}`);
        if (!$box.length) return;

        $box.html(`
        <table>
          <tr>
            <td class="label">χ²</td>
            <td>${formatValue(chi2)}</td>
            <td class="label">R²</td>
            <td>${formatValue(R2)}</td>
          </tr>
        </table>
      `).removeClass("d-none");
    }

    // par-tables -> value/min/max in every tab
    function applyParTablesToTabs(fitJson) {
        const parTables = Array.isArray(fitJson['par-tables']) ? fitJson['par-tables'] : null;
        if (!parTables) {
            console.warn('[FIT] No par-tables found in response JSON.');
            return;
        }

        $('#myTabContent .tab-pane').each(function (tabIdx) {
            const $tab = $(this);
            if (!parTables[tabIdx]) return;

            parTables[tabIdx].forEach((entry) => {
                const $row = findUiRowByLabel($tab, entry.name);
                if (!$row.length) return;

                const uiName = String($row.data('param'));
                const v    = convForUi(uiName, entry.value, $row);
                const vmin = convForUi(uiName, entry.min,   $row);
                const vmax = convForUi(uiName, entry.max,   $row);

                $row.find('.param-value').val(toExp5(v));
                $row.find('.param-min').val(toExp5(vmin));
                $row.find('.param-max').val(toExp5(vmax));
            });
        });
    }

    // fit-results -> errors in every tab
    function ErrorHybrid(fitJson) {
        const fitResults = fitJson && fitJson['fit-results'];
        if (typeof fitResults !== 'string') {
            console.warn('[ErrorHybrid] No fit-results found.');
            return;
        }

        const lines = fitResults.trim().split(/\r?\n/);
        if (lines.length < 2) return;

        const header = lines[0].split(',').map(s => s.trim());
        let col = header.findIndex(h => h.indexOf('err') !== -1) - 1;
        if (col < 1) col = DmodeState.D === "Y" ? 7 : 6;

        const paramColumns = [];
        for (; col + 1 < header.length; col += 2) {
            paramColumns.push({ label: header[col], valueCol: col, errCol: col + 1 });
        }

        $('#myTabContent .tab-pane').each(function (tabIdx) {
            const $tab = $(this);
            const line = lines[tabIdx + 1];
            if (!line) return;

            const cols = line.split(',').map(s => s.trim());

            paramColumns.forEach(({ label, valueCol, errCol }) => {
                if (errCol >= cols.length) return;
                const $row = findUiRowByLabel($tab, label);
                if (!$row.length) return;

                const uiName = String($row.data('param'));
                const errUi = convErrForUi(uiName, cols[errCol], cols[valueCol], $row);
                $row.find('.param-error').val(errUi === '' ? '' : toExp5(errUi));
            });
        });
    }

    function missingInputToast(msg, type = "info") {
        const toastEl = document.getElementById("mainToast");
        if (!toastEl) { alert(msg); return; }

        toastEl.querySelector(".toast-body").textContent = msg;
        toastEl.classList.remove("bg-info", "bg-warning", "bg-danger");
        toastEl.classList.add(type === "warning" ? "bg-warning" :
            type === "danger" ? "bg-danger" : "bg-info");

        const toast = new bootstrap.Toast(toastEl);
        toast.show();
    }

    function renderSamePlotEverywhere(datasetsArr, curvesArr, mode = "fit") {
        $('#myTabContent .tab-pane').each(function () {
            const pid = this.id;
            $(`#${pid}-plots-container`).css('visibility', 'visible');
            plotNewDataMulti_hybrid(datasetsArr, curvesArr, pid, mode);
        });
    }

    // Split a text blob into blocks separated by one-or-more lines that start with '#'
    function splitByHashBlocks_corr(text) {
        const lines = String(text || "").replace(/\\n/g, '\n').split('\n');
        const blocks = [];
        let current = [];

        const flush = () => {
            if (current.length) {
                blocks.push(current.join('\n'));
                current = [];
            }
        };

        for (const raw of lines) {
            const line = raw.trim();
            if (line.startsWith('#')) {
                flush();
            } else if (line !== "") {
                current.push(line);
            }
        }
        flush();
        return blocks.filter(b => b.trim() !== "");
    }

    function parseDadosforPlot_corr(dadosText) {
        const blocks = splitByHashBlocks_corr(dadosText);
        return blocks.map(block => {
            const data = [];
            block.split('\n').forEach(raw => {
                const parts = raw.trim().split(/\s+/);
                if (parts.length >= 2) {
                    const x = parseFloat(parts[0]);
                    const y = parseFloat(parts[1]);
                    if (!Number.isNaN(x) && !Number.isNaN(y)) data.push({ x, y });
                }
            });
            return { data };
        });
    }

    // one dataset = one block; y = last numeric value
    function parseSingleFitCurveBlock_hybrid(block) {
        const out = [];
        for (const raw of block.split('\n')) {
            const trimmed = raw.trim();
            if (!trimmed) continue;
            const parts = trimmed.split(/\s+/).map(Number).filter(n => !isNaN(n));
            if (parts.length >= 2) out.push({ x: parts[0], y: parts[parts.length - 1] });
        }
        return out;
    }

    function normalizeFitCurvesBlocks_hybrid(fitCurves, mode) {
        if (!fitCurves) return [];

        if (mode === "compare") {
            return Array.isArray(fitCurves) ? fitCurves.slice() : [String(fitCurves)];
        }

        if (Array.isArray(fitCurves)) {
            const blocks = [];
            fitCurves.forEach(item => {
                splitByHashBlocks_corr(String(item)).forEach(b => blocks.push(b));
            });
            return blocks;
        }
        return splitByHashBlocks_corr(String(fitCurves));
    }

    function parseMultiFitCurves_corr(fitCurves, mode = "fit") {
        if (mode === "compare") return fitCurves;
        const blocks = normalizeFitCurvesBlocks_hybrid(fitCurves, mode);
        return blocks.map(parseSingleFitCurveBlock_hybrid);
    }

    function plotNewDataMulti_hybrid(datasetsArr, curvesArr, activeTabId, mode = "fit") {
        const traces = [];
        const n = Math.min(
            Array.isArray(datasetsArr) ? datasetsArr.length : 0,
            Array.isArray(curvesArr) ? curvesArr.length : 0
        );

        const temps = $('.nav-tabs .nav-link .additional-input').map(function () {
            const t = parseFloat($(this).val());
            return Number.isFinite(t) ? t : '';       // '' keeps tab alignment
        }).get();

        const colors = Array.from(
            { length: Math.max(n, 1) },
            (_, i) => `hsl(${(i * 360 / Math.max(n, 1))}, 100%, 50%)`
        );

        for (let i = 0; i < n; i++) {
            const ds = datasetsArr[i];
            const cv = curvesArr[i];
            const color = colors[i];
            const labelSuffix = (temps[i] !== '' && temps[i] !== undefined) ? ` [${temps[i]}]` : '';

            if (ds?.data?.length) {
                traces.push({
                    x: ds.data.map(p => p.x),
                    y: ds.data.map(p => p.y),
                    mode: 'markers',
                    type: 'scatter',
                    name: `Data points ${i + 1}${labelSuffix}`,
                    marker: { color },
                    visible: (mode === 'plot') ? 'legendonly' : true
                });
            }

            if (Array.isArray(cv) && cv.length) {
                traces.push({
                    x: cv.map(p => p.x),
                    y: cv.map(p => p.y),
                    mode: 'lines',
                    type: 'scatter',
                    name: `Fit Curve ${i + 1}${labelSuffix}`,
                    line: { color, width: 2 }
                });
            }
        }

        const layout = {
            xaxis: { title: { text: 'Larmor Frequency [Hz]' }, type: 'log', autorange: true, tickformat: '.0e' },
            yaxis: { title: { text: 'Relaxation rate [1/s]' }, autorange: true }
        };

        $(`#${activeTabId}-plots-container`).css('visibility', 'visible');
        Plotly.react(`${activeTabId}-plot`, traces, layout);
    }

    function hybrid_plotNormalForActiveTab() {
        const activeTabId = $('#myTabContent .tab-pane.active').attr('id');
        if (!__corrLastFitJson) { alert('Run Fit first.'); return; }

        const datasetsArr = parseDadosforPlot_corr(__corrLastFitJson["Dados"]);
        const curvesArr   = parseMultiFitCurves_corr(__corrLastFitJson["fit-curves"], "fit");
        plotNewDataMulti_hybrid(datasetsArr, curvesArr, activeTabId, "fit");
    }

    function parseFitCurvesISOS(fitCurvesArray) {
        const IS = [];
        const OS = [];

        fitCurvesArray.forEach(dataString => {
            const lines = String(dataString).replace(/\\n/g, '\n').trim().split("\n");
            lines.forEach(line => {
                const trimmed = line.trim();
                if (!trimmed || trimmed.startsWith('#')) return;

                const parts = trimmed.split(/\s+/).map(Number);
                if (parts.length < 4) return; // x + at least 3 values

                const x = parts[0], y1 = parts[1], y2 = parts[2];
                if (!isNaN(x) && !isNaN(y1)) IS.push({ x, y: y1 });
                if (!isNaN(x) && !isNaN(y2)) OS.push({ x, y: y2 });
            });
        });

        return { IS, OS };
    }

    function hybrid_plotContribForActiveTab() {
        const activeTabId = $('#myTabContent .tab-pane.active').attr('id');
        if (!__corrLastFitJson) { alert('Run Fit first.'); return; }

        const tabIdx = Math.max(0, $('#myTabContent .tab-pane').index($(`#${activeTabId}`)));

        const datasetsArr = parseDadosforPlot_corr(__corrLastFitJson["Dados"]);
        const ds = Array.isArray(datasetsArr) ? (datasetsArr[tabIdx] || datasetsArr[0]) : null;

        const perProfileBlocks = normalizeFitCurvesBlocks_hybrid(__corrLastFitJson["fit-curves"], "fit");
        const blockForTab = Array.isArray(perProfileBlocks) ? perProfileBlocks[tabIdx] : null;

        const { IS, OS } = blockForTab ? parseFitCurvesISOS([blockForTab]) : { IS: [], OS: [] };

        const traces = [];
        if (ds && ds.data && ds.data.length) {
            traces.push({ x: ds.data.map(p => p.x), y: ds.data.map(p => p.y),
                mode: 'markers', type: 'scatter', name: 'Data Points', visible: true });
        }
        if (IS.length) {
            traces.push({ x: IS.map(p => p.x), y: IS.map(p => p.y),
                mode: 'lines', type: 'scatter', name: 'IS', line: { width: 2 } });
        }
        if (OS.length) {
            traces.push({ x: OS.map(p => p.x), y: OS.map(p => p.y),
                mode: 'lines', type: 'scatter', name: 'OS', line: { dash: 'dot', width: 2 } });
        }

        const layout = {
            xaxis: { title: { text: 'Larmor Frequency [Hz]' }, type: 'log', autorange: true, tickformat: '.0e' },
            yaxis: { title: { text: 'Relaxation rate [1/s]' }, autorange: true },
            showlegend: true
        };

        $(`#${activeTabId}-plots-container`).css('visibility', 'visible');
        Plotly.react(`${activeTabId}-plot`, traces, layout);
    }

    function getCheckedFitMethods() {
        const map = {
            "simp-check":  "simp",
            "scan-check":  "scan",
            "min-check":   "migrad",
            "minos-check": "minos"
        };
        return Object.keys(map)
            .filter(id => $("#" + id).is(":checked"))
            .map(id => map[id]);
    }

    function runFlorenceHybridFit() {
        const hasShared = $('.shared-checkbox:checked').length > 0;   // as _corr: hybrid=yes only with shared params
        return $.ajax({
            url: '/fit_florence_hybrid',
            method: 'POST',
            data: { methods: getCheckedFitMethods(), variant: FLORENCE_VARIANT, shared: hasShared ? 'yes' : 'no' },
            traditional: true
        });
    }

    const setSpin = on => $('#fit-spinner-overlay').toggleClass('d-none', !on).toggleClass('d-flex', on);
    const setDis  = d  => $('#fit-button, #plot-button, #switch-plot, #close-plot').prop('disabled', d);

    $('#submit-button').off('click').on('click', () => saveParams_FlorenceHybrid());

    $('#fit-button').off('click').on('click', function () {
        console.log('[FIT] Saving UI to *_hybrid.json, then running /fit_florence_hybrid ...');
        setDis(true);
        setSpin(true);

        saveParams_FlorenceHybrid()
            .then(() => runFlorenceHybridFit())
            .then((response) => {
                let fitJson;
                try {
                    fitJson = (typeof response === 'string') ? JSON.parse(response) : response;
                } catch (err) {
                    console.error('[FIT] Could not parse JSON:', err, response);
                    alert('Fit failed: invalid JSON from server.');
                    return;
                }

                applyParTablesToTabs(fitJson);

                __corrLastFitJson = fitJson;
                const datasetsArr = parseDadosforPlot_corr(fitJson["Dados"]);
                const curvesArr   = parseMultiFitCurves_corr(fitJson["fit-curves"], "fit");
                renderSamePlotEverywhere(datasetsArr, curvesArr);

                $('#myTabContent .tab-pane').each(function (tabIdx) {
                    updateHybridFitQuality(this.id, fitJson, tabIdx);
                    setAxisScaleUIVisible(this.id, true);
                });
                ErrorHybrid(fitJson);
            })
            .catch((err) => {
                if (err && (err.statusText === 'abort' || err === 'abort')) {
                    console.log('Fit aborted by user');
                    return;
                }
                const msg = (err && (err.responseText || err.statusText)) ? String(err.responseText || err.statusText) : 'Unknown error';
                console.error('Fit error:', err);
                console.log('Fit failed:', msg);
            })
            .always(() => {
                setDis(false);
                setSpin(false);
            });
    });

    $('#plot-button').off('click').on('click', function () {
        const shared = ($('#shared-textarea').val() || "");
        if (!shared.trim() || shared.includes("<Add input here>")) {
            missingInputToast("Please provide an input", "warning");
            return;
        }

        setDis(true);
        setSpin(true);

        saveParams_FlorenceHybrid(true)
            .then(() => runFlorenceHybridFit())
            .then(response => {
                const fitJson = (typeof response === "string") ? JSON.parse(response) : response;
                if (!fitJson) throw new Error("Empty JSON returned from /fit_florence_hybrid");

                __corrLastFitJson = fitJson;

                const datasetsArr = parseDadosforPlot_corr(fitJson["Dados"]);
                const curvesArr   = parseMultiFitCurves_corr(fitJson["fit-curves"], "fit");
                renderSamePlotEverywhere(datasetsArr, curvesArr, "plot");

                $('#myTabContent .tab-pane').each(function () {
                    setAxisScaleUIVisible(this.id, true);
                });
            })
            .catch(err => {
                console.error('[PLOT] Error:', err);
                alert('Plot failed: ' + (err?.responseText || err?.statusText || err?.message || 'Unknown error'));
            })
            .always(() => {
                setSpin(false);
                setDis(false);
            });
    });

    $('#cancel-fit-button').off('click').on('click', function () {
        __cancelAjax.abortAll();
        $.ajax({ url: '/fit_cancel', method: 'POST' });
        setSpin(false);
        setDis(false);
        console.log('All AJAX aborted and backend processes canceled.');
    });

    $('#close-plot').off('click').on('click', function () {
        const activeTabId = $('#myTabContent .tab-pane.active').attr('id');
        Plotly.purge(`${activeTabId}-plot`);
        $(`#${activeTabId}-plots-container`).css('visibility', 'hidden');
        setAxisScaleUIVisible(activeTabId, false);
    });

    (function () {
        const __corrCompareModeByTab = {};

        $('#switch-plot').off('click').on('click', function () {
            const activeTabId = $('#myTabContent .tab-pane.active').attr('id');
            __corrCompareModeByTab[activeTabId] = !__corrCompareModeByTab[activeTabId];

            if (__corrCompareModeByTab[activeTabId]) hybrid_plotContribForActiveTab();
            else                                     hybrid_plotNormalForActiveTab();
        });
    })();

    $('#switch-plot').hide().prop('disabled', true);

    // Show or hide the C button based on the active tab's Outer Sphere checkbox
    $(document).on('shown.bs.tab change', 'a[data-toggle="tab"], [id^="outerSphereCheckbox-"]', function () {
        const activeTab = $('#myTabContent .tab-pane.active').attr('id');
        const isOSChecked = $(`#outerSphereCheckbox-${activeTab}`).is(':checked');
        $('#switch-plot').toggle(isOSChecked).prop('disabled', !isOSChecked);
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
    });

    inputField.on('keypress', function (e) {
        if (e.which == 13) { // Enter key pressed
            const newName = $(this).val();
            inputField.replaceWith(`<span id="${profileId}-name" class="tab-name">${newName}</span>`);
        }
    });
}

$(document).on('click', '.editable-profile-name', function () {
    const profileId = $(this).data('profile');
    const tabNameElement = $(`#${profileId}-name`);
    enableTabRename(profileId, tabNameElement);
});

(function () {

    function pad2(n) { return String(n).padStart(2, '0'); }

    function makeTimestamp() {
        const d = new Date();
        return (
            pad2(d.getHours()) +
            pad2(d.getMinutes()) +
            pad2(d.getDate()) +
            pad2(d.getMonth() + 1) +
            pad2(d.getFullYear() % 100)
        ); // HHmmDDMMyy
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

    function showExportError(msg) {
        alert(msg);
    }

    function getProfileIndex(profileId) {
        const m = String(profileId).match(/profile(\d+)/i);
        return m ? parseInt(m[1], 10) : 1;
    }

    function getFixFree($row) {
        return $row.find('.fix-free-switch').is(':checked') ? 'Free' : 'Fix';
    }

    function getGraphDiv(profileId) {
        return document.getElementById(`${profileId}-plot`) || null;
    }

    function getFitQuality(profileId) {
        const $box = $(`#fit-quality-${profileId}`);
        if (!$box.length) return { chi2: '', R2: '' };

        const tds = $box.find('td');
        if (tds.length >= 4) {
            return { chi2: $(tds[1]).text().trim(), R2: $(tds[3]).text().trim() };
        }
        return { chi2: '', R2: '' };
    }

    function hasAnyPlot(profileId) {
        const gd = getGraphDiv(profileId);
        if (!gd || !gd.data || !Array.isArray(gd.data)) return false;

        const idx = getProfileIndex(profileId);
        const reData = new RegExp(`^Data\\s*points\\s*${idx}(\\b|\\s|\\[)`, 'i');
        const reFit  = new RegExp(`^Fit\\s*Curve\\s*${idx}(\\b|\\s|\\[)`, 'i');

        const hasNumbered =
            gd.data.some(t => reData.test(String(t?.name || ''))) ||
            gd.data.some(t => reFit.test(String(t?.name || '')));

        const hasContrib =
            gd.data.some(t => /^Data\s*Points$/i.test(String(t?.name || ''))) ||
            gd.data.some(t => /^IS$/i.test(String(t?.name || ''))) ||
            gd.data.some(t => /^OS$/i.test(String(t?.name || '')));

        return hasNumbered || hasContrib;
    }

    function getDataFromPlot(profileId) {
        const gd = getGraphDiv(profileId);
        if (!gd || !gd.data) return { x: [], y: [], yerr: [] };

        const idx = getProfileIndex(profileId);
        const reNumbered = new RegExp(`^Data\\s*points\\s*${idx}(\\b|\\s|\\[)`, 'i');
        let tData = gd.data.find(t => t && reNumbered.test(String(t.name || '')));
        if (!tData) tData = gd.data.find(t => t && /^Data\s*Points$/i.test(String(t.name || '')));

        if (!tData || !Array.isArray(tData.x) || !Array.isArray(tData.y)) {
            return { x: [], y: [], yerr: [] };
        }

        const errArr = (tData.error_y && Array.isArray(tData.error_y.array)) ? tData.error_y.array : [];
        return { x: tData.x.slice(), y: tData.y.slice(), yerr: errArr.slice() };
    }

    function getFitFromPlot(profileId) {
        const gd = getGraphDiv(profileId);
        if (!gd || !gd.data) return { x: [], y1: [], y2: [], hasTwo: false };

        const idx = getProfileIndex(profileId);

        const tIS = gd.data.find(t => t && /^IS$/i.test(String(t.name || '')));
        const tOS = gd.data.find(t => t && /^OS$/i.test(String(t.name || '')));
        if (tIS && tOS && Array.isArray(tIS.x) && Array.isArray(tIS.y) && Array.isArray(tOS.y)) {
            return { x: tIS.x.slice(), y1: tIS.y.slice(), y2: tOS.y.slice(), hasTwo: true };
        }

        const reFit = new RegExp(`^Fit\\s*Curve\\s*${idx}(\\b|\\s|\\[)`, 'i');
        const tFit = gd.data.find(t => t && reFit.test(String(t.name || '')));
        if (!tFit || !Array.isArray(tFit.x) || !Array.isArray(tFit.y)) {
            return { x: [], y1: [], y2: [], hasTwo: false };
        }
        return { x: tFit.x.slice(), y1: tFit.y.slice(), y2: [], hasTwo: false };
    }

    function exportParametersCsv_hybrid() {

        // --- 0. Reference values from profile 1 (same as the results table) ---
        const $p1 = $('#profile1');
        const readV_p1 = (p) => parseFloat($p1.find(`.parameter-input[data-param="${p}"] .param-value`).val());
        const Tref = parseFloat($('#profile1-tab .additional-input').val());

        const modelFreeActive    = $('#modelFreeCheckbox-profile1').is(':checked');
        const secondSphereActive = $('#secondSphereCheckbox-profile1').is(':checked');

        // tau param -> [ref value, activation energy]
        const REF = {
            tm:  [readV_p1('tm'), readV_p1('Em')],
            tR:  [readV_p1('tR'), readV_p1('ER')],
            tv:  [readV_p1('tv'), readV_p1('Ev')]
        };
        if (modelFreeActive)    REF.tl  = [readV_p1('tl'),  readV_p1('El')];
        if (secondSphereActive) REF.tm2 = [readV_p1('tm2'), readV_p1('Em2')];

        const ENERGY_OF = { tm: 'Em', tR: 'ER', tv: 'Ev', tl: 'El', tm2: 'Em2' };

        // Same "invalid pair" rule as the results table: Fix + 0 means no Arrhenius scaling.
        const isInvalidArrh = (Ename) => {
            const $row = $p1.find(`.parameter-input[data-param="${Ename}"]`);
            if (!$row.length) return false;
            const isFree = $row.find('.fix-free-switch').is(':checked');
            const v      = parseFloat($row.find('.param-value').val());
            return (!isFree && Number.isFinite(v) && v === 0);
        };

        const arrh = (tauRef, E, T) => tauRef * Math.exp(E * (1.0 / T - 1.0 / Tref));

        // --- 1. Collect all tabs and their temperatures ---
        const allTabs = [];
        $('#myTabContent .tab-pane').each(function () {
            const pid = $(this).attr('id');
            if (!pid) return;
            const T = parseFloat($(`#${pid}-tab .additional-input`).val());
            allTabs.push({ pid, T: Number.isFinite(T) ? T : '' });
        });

        if (!allTabs.length) { showExportError('Export error: no tabs found.'); return; }

        if (!allTabs.some(({ pid }) => hasAnyPlot(pid))) {
            showExportError('Export error: no plot found in any tab. Please run a fit or plot first.');
            return;
        }

        // --- 2. Gather per-tab data ---
        const tabData = allTabs.map(({ pid, T }) => {
            const paramRows = [];
            $(`#${pid} .parameter-input`).each(function () {
                const $row = $(this);
                const param = String($row.data('param') || '').trim();
                if (!param) return;

                let value      = $row.find('.param-value').val();
                const errorRaw = $row.find('.param-error').val();
                const isTau    = REF.hasOwnProperty(param);
                const error    = (pid !== 'profile1' && isTau) ? '' : ((!errorRaw || String(errorRaw).trim() === '') ? 'na' : errorRaw);

                // Arrhenius-scale τ for tabs other than profile 1 (profile 1 holds the reference at Tref)
                if (pid !== 'profile1' && isTau && Number.isFinite(Tref) && Number.isFinite(T)) {
                    const [ref, E] = REF[param];
                    if (!isInvalidArrh(ENERGY_OF[param]) && Number.isFinite(ref) && Number.isFinite(E)) {
                        value = arrh(ref, E, T);
                    }
                }

                paramRows.push({ param, fixfree: getFixFree($row), value, error });
            });
            paramRows.push({ param: 'T', fixfree: '', value: T !== '' ? String(T) : '', error: '' });

            const { chi2, R2 } = getFitQuality(pid);
            return { T, paramRows, chi2, R2, fit: getFitFromPlot(pid), dat: getDataFromPlot(pid) };
        });

        // --- 3. Header ---
        const header = ['Parameter', 'Fix/Free', 'Value', 'Error', 'chi2', 'R2', '', ''];
        tabData.forEach(({ T }) => {
            const label = T !== '' ? `_${T}` : '';
            header.push(`fit_x${label}`, `fit_y${label}`, '', `data_x${label}`, `data_y${label}`, '');
        });

        // --- 4. Rows: params stacked vertically per tab (A-F), series side by side ---
        const tabParamCount = tabData.map(td => td.paramRows.length);
        const tabParamOffset = (tabIdx) => tabParamCount.slice(0, tabIdx).reduce((a, b) => a + b, 0);

        let totalRows = 0;
        tabData.forEach((td, i) => {
            totalRows = Math.max(totalRows, tabParamOffset(i) + tabParamCount[i]);
            totalRows = Math.max(totalRows, Math.max(td.fit.x.length, td.dat.x.length));
        });

        const numCols = 8 + tabData.length * 6;
        const rows = Array.from({ length: totalRows }, () => Array(numCols).fill(''));

        tabData.forEach((td, tabIdx) => {
            const rowStart = tabParamOffset(tabIdx);
            td.paramRows.forEach(({ param, fixfree, value, error }, rowOff) => {
                const r = rowStart + rowOff;
                rows[r][0] = param;
                rows[r][1] = fixfree;
                rows[r][2] = value;
                rows[r][3] = error;
            });
            rows[rowStart][4] = td.chi2 || '';
            rows[rowStart][5] = td.R2   || '';
        });

        tabData.forEach((td, tabIdx) => {
            const colBase = 8 + tabIdx * 6;
            const { fit, dat } = td;
            const seriesLen = Math.max(fit.x.length, dat.x.length);
            for (let r = 0; r < seriesLen; r++) {
                rows[r][colBase + 0] = fit.x[r]  ?? '';
                rows[r][colBase + 1] = fit.y1[r] ?? '';
                rows[r][colBase + 3] = dat.x[r]  ?? '';
                rows[r][colBase + 4] = dat.y[r]  ?? '';
            }
        });

        // --- 5. Serialise ---
        const filename = `${makeTimestamp()}_${FLORENCE_VARIANT}_hybrid.csv`;
        const csvText  = [rowToCsv(header), ...rows.map(r => rowToCsv(r))].join('\n') + '\n';
        downloadBlob(new Blob([csvText], { type: 'text/csv;charset=utf-8' }), filename);
    }

    $(document)
        .off('click.exportCsvHybrid', '#export-button')
        .on('click.exportCsvHybrid', '#export-button', function (e) {
            e.preventDefault();
            e.stopPropagation();
            exportParametersCsv_hybrid();
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



