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
    const sharedState = {};
    const fixFreeState = {};
    let __syncingFixFree = false;
    let sharedTextDirty = false;
    let __progSharedUpdate = false;
    let __corrLastFitJson = null;
    const unitState = {};
    let __syncingUnits = false;

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
    if (!document.getElementById('corrTab')) {
        $('#myTabContent').wrap('<div id="corrTab"></div>');
    }


    const DmodeState = { D: "A" };  // default mode
    let __syncingDmode = false;


    function applySharedStateToProfile(profileId) {
        $(`#${profileId} .shared-checkbox`).each(function () {
            const p = $(this).data('param');
            if (sharedState.hasOwnProperty(p)) {
                $(this).prop('checked', !!sharedState[p]);
            }
        });
    }

    function applyFixFreeStateToProfile(profileId) {
        __syncingFixFree = true;
        try {
            $(`#${profileId} .parameter-input`).each(function () {
                const p = String($(this).data('param') || '');
                if (!p) return;
                if (fixFreeState.hasOwnProperty(p)) {
                    const isFree = !!fixFreeState[p];
                    const $sw = $(this).find('.fix-free-switch');
                    if ($sw.length) {
                        $sw.prop('checked', isFree);
                        $sw.next('label').text(isFree ? 'Free' : 'Fix');
                    }
                }
            });
        } finally {
            __syncingFixFree = false;
        }
    }

    function syncFixFreeAcrossTabs(paramName, isFree) {
        fixFreeState[paramName] = !!isFree;

        __syncingFixFree = true;
        try {
            $(`.parameter-input[data-param="${paramName}"]`).each(function () {
                const $row = $(this);

                // sync switch + label
                $row.find('.fix-free-switch').prop('checked', isFree);
                $row.find('.fix-free-switch').next('label').text(isFree ? 'Free' : 'Fix');

                if (paramName === 'D') {
                    const $staticLabel = $row.find('.d-label-static');
                    const $dropdownLbl = $row.find('.d-label-dropdown');

                    if (isFree) {
                        $staticLabel.show();
                        $dropdownLbl.hide();
                    } else {
                        $staticLabel.hide();
                        $dropdownLbl.show();
                    }
                }
            });
        } finally {
            __syncingFixFree = false;
        }
    }


    function syncDistreteD(mode) {
        DmodeState.D = mode;

        __syncingDmode = true;
        try {
            // For all D dropdowns already present
            $('.parameter-input[data-param="D"] .d-label-dropdown').each(function () {
                const $menu = $(this);

                // update active item
                $menu.find('.dropdown-item').removeClass('active')
                    .filter(`[data-mode="${mode}"]`).addClass('active');

                // update button label
                const text = $menu.find(`.dropdown-item.active`).html();
                $menu.find('button').html(text);
            });
        } finally {
            __syncingDmode = false;
        }
    }
    function applyDmodeToProfile(profileId) {
        const $row = $(`#${profileId} .parameter-input[data-param="D"]`);
        const $dropdown = $row.find('.d-label-dropdown');
        const mode = DmodeState.D;

        $dropdown.find('.dropdown-item').removeClass('active')
            .filter(`[data-mode="${mode}"]`).addClass('active');

        const text = $dropdown.find('.dropdown-item.active').html();
        $dropdown.find('button').html(text);
    }




    function applyUnitStateToProfile(profileId) {
        __syncingUnits = true;
        const $tab = $(`#${profileId}`);
        if (unitState.Delta2) $tab.find('.delta-unit-select').val(unitState.Delta2);
        if (unitState.r)      $tab.find('.r-unit-select').val(unitState.r);
        if (unitState.a)      $tab.find('.a-unit-select').val(unitState.a);
        __syncingUnits = false;
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

    function updateCorrFitQuality(profileId, fitJson, tabIdx) {
        const fitResults = fitJson && fitJson["fit-results"];
        if (typeof fitResults !== "string") return;

        const lines = fitResults.trim().split(/\r?\n/);
        // lines[0] = header
        // lines[1] = Profile 1, lines[2] = Profile 2, ...
        if (lines.length < 2) return;

        // tabIdx is 0-based (0 → Profile 1, 1 → Profile 2, ...)
        let dataLineIndex = 1; // default to first profile
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



    const sectionState = {
        fermi: false,
        modelFree: false,
        outerSphere: false,
    };

    let __syncingSections = false;

    function StateOfProfile(profileId) {
        __syncingSections = true;
        try {
            $(`#fermiContactTermCheckbox-${profileId}`)
                .prop("checked", !!sectionState.fermi)
                .trigger("change");

            $(`#modelFreeCheckbox-${profileId}`)
                .prop("checked", !!sectionState.modelFree)
                .trigger("change");

            $(`#outerSphereCheckbox-${profileId}`)
                .prop("checked", !!sectionState.outerSphere)
                .trigger("change");
        } finally {
            __syncingSections = false;
        }
    }


    function syncSectionAcrossTabs(sectionKey, isChecked) {
        sectionState[sectionKey] = !!isChecked;

        __syncingSections = true;
        try {
            $(".tab-pane").each(function () {
                const pid = $(this).attr("id");
                if (sectionKey === "fermi") {
                    $(`#fermiContactTermCheckbox-${pid}`).prop("checked", isChecked).trigger("change");
                } else if (sectionKey === "modelFree") {
                    $(`#modelFreeCheckbox-${pid}`).prop("checked", isChecked).trigger("change");
                } else if (sectionKey === "outerSphere") {
                    $(`#outerSphereCheckbox-${pid}`).prop("checked", isChecked).trigger("change");
                }
            });
        } finally {
            __syncingSections = false;
        }
    }


    $('.parameter-input input[type="text"]').each(function () {
        let value = $(this).val();
        if (value !== "") {
            $(this).val(formatValue(value));
        }
    });

    function createParameterFields(profileId) {
        const parameterContainer = $(`#${profileId}`);

        const flexContainer = `
        <div class="profile-flex" style="gap:30px;">
          <div class="parameters-container" id="${profileId}-parameters" style="width: 50%;"></div>
          <div class="plots-container" id="${profileId}-plots-container" style="width: 50%; visibility: hidden;">
            <div id="${profileId}-plot" style="height: 650px; width: 800px;"></div>
          </div>
        </div>`;


        parameterContainer.append(flexContainer);

        const parametersContainer = $(`#${profileId}-parameters`);
        const SHARED_PAR = ['q','C','ms','rho','S','tm','tR','tv','r','Delta2','Aoh','SLS','tl','D','a','fn'];

        parameters.forEach((param, index) => {
            const isFixedByDefault = ["q","C","ms","S","rho"].includes(param.name);
            const switchId = `switch${profileId}-${index}`;

            const minDefault = param.name === 'tm' ? 1e-11 :
                param.name === 'tv' ? 1e-12 :
                    param.name === 'tR' ? 1e-12 : '';
            const maxDefault = param.name === 'tm' ? 1e-6 :
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

            const sharedCheckbox = SHARED_PAR.includes(param.name)
                ? `
      <div class="form-check form-check-inline ms-1">
        <input class="form-check-input shared-checkbox" type="checkbox"
               id="${profileId}-${param.name}-shared" data-param="${param.name}">
        <label class="form-check-label" for="${profileId}-${param.name}-shared">Shared</label>
      </div>` : '';

            const copySelect = `
              <select class="form-select ms-2 copy-${param.name}-select narrow-select"
                      data-param="${param.name}" data-profile="${profileId}">
                <option value="indie">indie</option>
              </select>`;

            let uiName = param.name;
            if (param.name === 'Delta2') uiName = 'Δ<sup>2</sup>';
            else if (param.name === 'tm') uiName = 'τ<sub>m</sub>';
            else if (param.name === 'tR') uiName = 'τ<sub>R</sub>';
            else if (param.name === 'tv') uiName = 'τ<sub>v</sub>';
            else if (param.name === 'tl') uiName = 'τ<sub>l</sub>';
            else if (param.name === 'fn') uiName = 'f<sub>n</sub>';

            let paramLabelHTML = `<span class="input-group-text">${uiName}</span>`;

            if (param.name === "r") {
                paramLabelHTML = `
        <div class="input-group-text dropdown param-label-dropdown">
          <button class="btn btn-sm btn-light dropdown-toggle" type="button" data-bs-toggle="dropdown" aria-expanded="false">
            r [Å]
          </button>
          <ul class="dropdown-menu">
            <li><a class="dropdown-item active" href="#" data-unit="A">r [Å]</a></li>
            <li><a class="dropdown-item" href="#" data-unit="m">r [m]</a></li>
          </ul>
        </div>`;
            } else if (param.name === "Delta2") {
                paramLabelHTML = `
        <div class="input-group-text dropdown param-label-dropdown">
          <button class="btn btn-sm btn-light dropdown-toggle" type="button" data-bs-toggle="dropdown" aria-expanded="false">
            Δ<sup>2</sup> [cm<sup>-1</sup>]
          </button>
          <ul class="dropdown-menu">
            <li><a class="dropdown-item" href="#" data-unit="s-2">Δ<sup>2</sup> [s<sup>-2</sup>]</a></li>
            <li><a class="dropdown-item active" href="#" data-unit="cm-1">Δ<sup>2</sup> [cm<sup>-1</sup>]</a></li>
            <li><a class="dropdown-item" href="#" data-unit="ts0">ts0</a></li>
          </ul>
        </div>`;
            }

            const row = `
      <div class="parameter-input mb-3" data-param="${param.name}">
        <div class="input-group">
          ${paramLabelHTML}
          <span class="input-group-text p-0 switch-cell">
            <div class="form-check form-switch ms-2 me-2 my-1">
              <input class="form-check-input fix-free-switch" type="checkbox" role="switch"
                     id="${switchId}" data-param-index="${index}" ${isFixedByDefault ? "" : "checked"}>
              <label class="form-check-label ms-2" for="${switchId}">
                ${isFixedByDefault ? "Fix" : "Free"}
              </label>
            </div>
          </span>
          <input type="text" class="form-control param-value" placeholder="${param.long}"
                 title="${param.placeholder}" data-bs-toggle="tooltip" value="${valueDefault}">
          <input type="text" class="form-control param-error" placeholder="Error" readonly>
          <input type="text" class="form-control param-min" placeholder="min" value="${minDefault}">
          <input type="text" class="form-control param-max" placeholder="max" value="${maxDefault}">
        </div>
        ${sharedCheckbox}
        ${copySelect}
      </div>`;
            parametersContainer.append(row);
        });


        const fermiCheckboxHTML = `
    <div class="form-check mt-3">
      <input type="checkbox" class="form-check-input" id="fermiContactTermCheckbox-${profileId}">
      <label class="form-check-label" for="fermiContactTermCheckbox-${profileId}">
        Fermi Contact Term
      </label>
    </div>
    <div id="dynamicParametersContainer-${profileId}"></div>`;
        parametersContainer.append(fermiCheckboxHTML);

        const modelFreeCheckboxHTML = `
    <div class="form-check mt-3">
      <input type="checkbox" class="form-check-input" id="modelFreeCheckbox-${profileId}">
      <label class="form-check-label" for="modelFreeCheckbox-${profileId}">Model-Free</label>
    </div>
    <div id="modelFreeParametersContainer-${profileId}"></div>`;
        parametersContainer.append(modelFreeCheckboxHTML);

        const outerSphereCheckboxHTML = `
    <div class="form-check mt-3">
      <input type="checkbox" class="form-check-input" id="outerSphereCheckbox-${profileId}">
      <label class="form-check-label" for="outerSphereCheckbox-${profileId}">Outer Sphere</label>
    </div>
    <div id="outerSphereParametersContainer-${profileId}"></div>`;
        parametersContainer.append(outerSphereCheckboxHTML);
        StateOfProfile(profileId);

        const $newDrow = parametersContainer.find('.parameter-input[data-param="D"]');
        const $dropdown = $newDrow.find('.d-label-dropdown');
        const mode = DmodeState.D;

        $dropdown.find('.dropdown-item').removeClass('active')
            .filter(`[data-mode="${mode}"]`).addClass('active');

        $dropdown.find('button').html(
            $dropdown.find('.dropdown-item.active').html()
        );



        $(`#fermiContactTermCheckbox-${profileId}`).on('change', function () {
            const isChecked = $(this).is(':checked');

            if (!__syncingSections) {
                syncSectionAcrossTabs("fermi", isChecked);
                return;
            }

            const container = $(`#dynamicParametersContainer-${profileId}`);
            if (!isChecked) {
                container.empty();
                return;
            }
            const aohHTML = `
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
          <input type="text" class="form-control param-error" placeholder="Error" readonly>
          <input type="text" class="form-control param-min" placeholder="min">
          <input type="text" class="form-control param-max" placeholder="max">
        </div>
        <div class="form-check form-check-inline ms-1">
          <input class="form-check-input shared-checkbox" type="checkbox" id="${profileId}-Aoh-shared" data-param="Aoh">
          <label class="form-check-label" for="${profileId}-Aoh-shared">Shared</label>
        </div>
        <select class="form-select ms-2 copy-Aoh-select narrow-select" data-param="Aoh" data-profile="${profileId}">
          <option value="indie">indie</option>
        </select>
      </div>`;
            container.html(aohHTML);

            if (typeof applySharedStateToProfile === 'function') applySharedStateToProfile(profileId);
            if (typeof applyFixFreeStateToProfile === 'function') applyFixFreeStateToProfile(profileId);
            if (typeof updateSelectOptions === 'function') updateSelectOptions();
        });

        $(`#modelFreeCheckbox-${profileId}`).on('change', function () {
            const isChecked = $(this).is(':checked');
            const container = $(`#modelFreeParametersContainer-${profileId}`);

            if (!__syncingSections) {
                syncSectionAcrossTabs("modelFree", isChecked);
                return;
            }

            if (!isChecked) {
                container.empty();
                return;
            }

            const modelFreeHTML = `
      <div class="parameter-input mb-3" data-param="SLS">
        <div class="input-group">
          <div class="input-group-text dropdown param-label-dropdown">
            <button class="btn btn-sm btn-light dropdown-toggle" type="button" data-bs-toggle="dropdown" aria-expanded="false">
              S<sup>2</sup>
            </button>
            <ul class="dropdown-menu">
              <li><a class="dropdown-item active" href="#" data-unit="s2">S<sup>2</sup></a></li>
              <li><a class="dropdown-item" href="#" data-unit="sls">SLS</a></li>
            </ul>
          </div>
          <span class="input-group-text p-0 switch-cell">
            <div class="form-check form-switch ms-2 me-2 my-1">
              <input class="form-check-input fix-free-switch" type="checkbox" role="switch"
                     id="switchSLS-${profileId}" checked>
              <label class="form-check-label ms-2" for="switchSLS-${profileId}">Free</label>
            </div>
          </span>
          <input type="text" class="form-control param-value sls-value" title="Order parameter. Unit: SLS or S2" placeholder="Order parameter">
          <input type="text" class="form-control param-error" placeholder="Error" readonly>
          <input type="text" class="form-control param-min" placeholder="min" value="0">
          <input type="text" class="form-control param-max" placeholder="max" value="1">
        </div>
        <div class="form-check form-check-inline ms-1">
          <input class="form-check-input shared-checkbox" type="checkbox" id="${profileId}-SLS-shared" data-param="SLS">
          <label class="form-check-label" for="${profileId}-SLS-shared">Shared</label>
        </div>
        <select class="form-select ms-2 copy-SLS-select narrow-select" data-param="SLS" data-profile="${profileId}">
          <option value="indie">indie</option>
        </select>
      </div>

      <div class="parameter-input mb-3" data-param="tl">
        <div class="input-group">
          <span class="input-group-text">τ<sub>l</sub></span>
          <span class="input-group-text p-0 switch-cell">
            <div class="form-check form-switch ms-2 me-2 my-1">
              <input class="form-check-input fix-free-switch" type="checkbox" role="switch"
                     id="switchTl-${profileId}" checked>
              <label class="form-check-label ms-2" for="switchTl-${profileId}">Free</label>
            </div>
          </span>
          <input type="text" class="form-control param-value" title="Fast local reorientation time. Unit: s" placeholder="Fast local reorientation time">
          <input type="text" class="form-control param-error" placeholder="Error" readonly>
          <input type="text" class="form-control param-min" placeholder="min" value="1e-12">
          <input type="text" class="form-control param-max" placeholder="max" value="1e-6">
        </div>
        <div class="form-check form-check-inline ms-1">
          <input class="form-check-input shared-checkbox" type="checkbox" id="${profileId}-tl-shared" data-param="tl">
          <label class="form-check-label" for="${profileId}-tl-shared">Shared</label>
        </div>
        <select class="form-select ms-2 copy-tl-select narrow-select" data-param="tl" data-profile="${profileId}">
          <option value="indie">indie</option>
        </select>
      </div>`;
            container.html(modelFreeHTML);

            if (typeof applySharedStateToProfile === 'function') applySharedStateToProfile(profileId);
            if (typeof applyFixFreeStateToProfile === 'function') applyFixFreeStateToProfile(profileId);
            if (typeof updateSelectOptions === 'function') updateSelectOptions();
        });

        $(`#outerSphereCheckbox-${profileId}`).on('change', function () {
            const isChecked = $(this).is(':checked');
            const container = $(`#outerSphereParametersContainer-${profileId}`);

            if (!__syncingSections) {
                syncSectionAcrossTabs("outerSphere", isChecked);
                return;
            }

            if (!isChecked) {
                container.empty();
                return;
            }

            const outerSphereHTML = `
      
          <div class="parameter-input mb-3" data-param="D">
      <div class="input-group">
    
        <span class="input-group-text d-label-static">D</span>
    
        <div class="input-group-text dropdown param-label-dropdown d-label-dropdown" style="display:none;">
          <button class="btn btn-sm btn-light dropdown-toggle" type="button" data-bs-toggle="dropdown">
            D
          </button>
          <ul class="dropdown-menu">
            <li><a class="dropdown-item active" href="#" data-mode="A">D-General</a></li>
            <li><a class="dropdown-item" href="#" data-mode="B">D-Discrete</a></li>
          </ul>
        </div>
    
        <span class="input-group-text p-0 switch-cell">
          <div class="form-check form-switch ms-2 me-2 my-1">
            <input class="form-check-input fix-free-switch" type="checkbox" id="switchD-${profileId}" checked>
            <label class="form-check-label ms-2" for="switchD-${profileId}">Free</label>
          </div>
        </span>
    
        <input type="text" class="form-control param-value" value="2.4e-9" placeholder="Diffusion coefficient" title="Diffusion coefficient; Unit: m^2/s">
        <input type="text" class="form-control param-error" placeholder="Error" readonly>
        <input type="text" class="form-control param-min" placeholder="min">
        <input type="text" class="form-control param-max" placeholder="max">
      </div>
    
      <div class="form-check form-check-inline ms-1">
        <input class="form-check-input shared-checkbox" type="checkbox" id="${profileId}-D-shared" data-param="D">
        <label class="form-check-label" for="${profileId}-D-shared">Shared</label>
      </div>
    
      <select class="form-select ms-2 copy-D-select narrow-select" data-param="D" data-profile="${profileId}">
        <option value="indie">indie</option>
      </select>
    </div>




      <div class="parameter-input mb-3" data-param="a">
        <div class="input-group">
          <div class="input-group-text dropdown param-label-dropdown">
            <button class="btn btn-sm btn-light dropdown-toggle" type="button" data-bs-toggle="dropdown" aria-expanded="false">
              a [Å]
            </button>
            <ul class="dropdown-menu">
              <li><a class="dropdown-item active" href="#" data-unit="A">a [Å]</a></li>
              <li><a class="dropdown-item" href="#" data-unit="m">a [m]</a></li>
            </ul>
          </div>
          <span class="input-group-text p-0 switch-cell">
            <div class="form-check form-switch ms-2 me-2 my-1">
              <input class="form-check-input fix-free-switch" type="checkbox" role="switch"
                     id="switchA-${profileId}" checked>
              <label class="form-check-label ms-2" for="switchA-${profileId}">Free</label>
            </div>
          </span>
          <input type="text" class="form-control param-value" title="distance of closest approach. Unit: m or Å" placeholder="distance of closest approach" value="3.6">
          <input type="text" class="form-control param-error" placeholder="Error" readonly>
          <input type="text" class="form-control param-min" placeholder="min">
          <input type="text" class="form-control param-max" placeholder="max">
        </div>
        <div class="form-check form-check-inline ms-1">
          <input class="form-check-input shared-checkbox" type="checkbox" id="${profileId}-a-shared" data-param="a">
          <label class="form-check-label" for="${profileId}-a-shared">Shared</label>
        </div>
        <select class="form-select ms-2 copy-a-select narrow-select" data-param="a" data-profile="${profileId}">
          <option value="indie">indie</option>
        </select>
      </div>

      <div class="parameter-input mb-3" data-param="fn">
        <div class="input-group">
          <span class="input-group-text">f<sub>n</sub></span>
          <span class="input-group-text p-0 switch-cell">
            <div class="form-check form-switch ms-2 me-2 my-1">
              <input class="form-check-input fix-free-switch" type="checkbox" role="switch"
                     id="switchFn-${profileId}">
              <label class="form-check-label ms-2" for="switchFn-${profileId}">Fix</label>
            </div>
          </span>
          <input type="text" class="form-control param-value" title="fraction parameter" placeholder="fraction parameter" value="1">
          <input type="text" class="form-control param-error" placeholder="Error" readonly>
          <input type="text" class="form-control param-min" placeholder="min" value="0">
          <input type="text" class="form-control param-max" placeholder="max" value="1">
        </div>
        <div class="form-check form-check-inline ms-1">
          <input class="form-check-input shared-checkbox" type="checkbox" id="${profileId}-fn-shared" data-param="fn">
          <label class="form-check-label" for="${profileId}-fn-shared">Shared</label>
        </div>
        <select class="form-select ms-2 copy-fn-select narrow-select" data-param="fn" data-profile="${profileId}">
          <option value="indie">indie</option>
        </select>
      </div>`;
            container.html(outerSphereHTML);

            if (typeof applySharedStateToProfile === 'function') applySharedStateToProfile(profileId);
            if (typeof applyFixFreeStateToProfile === 'function') applyFixFreeStateToProfile(profileId);
            if (typeof updateSelectOptions === 'function') updateSelectOptions();
            applyDmodeToProfile(profileId);

        });
        updateSelectOptions();
    }



    $(document).on('change', '.fix-free-switch', function () {
        const isFree = $(this).is(':checked');
        $(this).next('label').text(isFree ? 'Free' : 'Fix');

        if (__syncingFixFree) return;

        const $row      = $(this).closest('.parameter-input');
        const paramName = $row.data('param');

        if (paramName === 'D') {
            const $staticLabel = $row.find('.d-label-static');
            const $dropdownLbl = $row.find('.d-label-dropdown');

            if (isFree) {
                // Free → show plain "D", hide dropdown
                $staticLabel.show();
                $dropdownLbl.hide();
            } else {
                // Fix → show dropdown, hide plain "D"
                $staticLabel.hide();
                $dropdownLbl.show();
            }
        }

        syncFixFreeAcrossTabs(String(paramName), isFree);
    });





    $(document).on('change', '.shared-checkbox', function () {
        const param = String($(this).data('param'));
        const isChecked = $(this).is(':checked');

        // persist global state
        sharedState[param] = !!isChecked;

        // reflect the same choice on all tabs for this param only
        $(`.shared-checkbox[data-param="${param}"]`).prop('checked', !!isChecked);
    });

    // When any param-label dropdown opens, bring its row to the front
    $(document).on('shown.bs.dropdown', '.param-label-dropdown', function () {
        $(this).closest('.parameter-input').addClass('z-top');
    });

// When it closes, restore normal stacking
    $(document).on('hidden.bs.dropdown', '.param-label-dropdown', function () {
        $(this).closest('.parameter-input').removeClass('z-top');
    });

// Unit selection from label dropdowns (Delta2, r, a, SLS)
    $(document).on('click', '.param-label-dropdown .dropdown-item', function (e) {
        e.preventDefault();
        const $item = $(this);
        const unit  = $item.data('unit');
        const $menu = $item.closest('.param-label-dropdown');
        const $row  = $item.closest('.parameter-input');
        const param = String($row.data('param') || '');

        // local active state + button label
        $menu.find('.dropdown-item').removeClass('active');
        $item.addClass('active');
        $menu.find('button').html($item.html());

        if (__syncingUnits) return;

        // persist + broadcast using existing unitState keys
        if (param === 'Delta2') unitState.Delta2 = unit;
        if (param === 'r')      unitState.r = unit;
        if (param === 'a')      unitState.a = unit;
        if (param === 'SLS')    unitState.SLS = unit; // new state slot if you want to track it

        __syncingUnits = true;
        try {
            $(`.parameter-input[data-param="${param}"] .param-label-dropdown`).each(function () {
                const $pm = $(this);
                $pm.find('.dropdown-item').removeClass('active')
                    .filter(`[data-unit="${unit}"]`).addClass('active');
                $pm.find('button').html($pm.find('.dropdown-item.active').html());
            });
        } finally {
            __syncingUnits = false;
        }
    });

    $(document).on('click', '.d-label-dropdown .dropdown-item', function (e) {
        e.preventDefault();

        const $item = $(this);
        const mode = $item.data('mode');
        const $menu = $item.closest('.param-label-dropdown');

        // local update
        $menu.find('.dropdown-item').removeClass('active');
        $item.addClass('active');
        $menu.find('button').html($item.html());



        if (__syncingDmode) return;

        // broadcast to all tabs
        syncDistreteD(mode);
    });





    function updateSelectOptions() {
        const paramNames = ["q", "C", "rho", "ms", "S", "tm", "tR", "tv", "r", "Delta2", "Aoh", "SLS", "tl", "D", "a", "fn"];
        paramNames.forEach(param => {

            $(`[class*="copy-${param}-select"]`).each(function () {
                const profileId = $(this).data('profile');
                $(this).find('option:not([value="indie"])').remove();

                for (let i = 1; i <= profileCount; i++) {
                    const sourceProfile = `profile${i}`;
                    if (sourceProfile !== profileId) {
                        $(this).append(`<option value="copy${i}">copy from ${i}</option>`);
                    }
                }
            });
        });
    }


    function updateTabSelectOptions() {
        const selectElement = $('#tab-select');
        selectElement.empty();

        $('.nav-tabs .nav-item .nav-link .tab-title .tab-name').each(function (index) {
            const tabTitle = $(this).text();
            selectElement.append(`<option value="${index + 1}">${tabTitle}</option>`);
        });
    }
    window.updateTabSelectOptions = updateTabSelectOptions;


    function copyParameterValue(fromProfile, toProfile, paramName) {
        const fromInput = $(`#${fromProfile} .parameter-input[data-param="${paramName}"] .param-value`);
        const toInput   = $(`#${toProfile} .parameter-input[data-param="${paramName}"] .param-value`);
        if (fromInput.length && toInput.length) {
            toInput.val(fromInput.val());
        }
    }


    $(document).on('change', '.copy-q-select, .copy-C-select, .copy-rho-select, .copy-ms-select, .copy-S-select, .copy-tm-select, .copy-tR-select, .copy-tv-select, .copy-r-select, .copy-Delta2-select, .copy-Aoh-select, .copy-SLS-select, .copy-tl-select, .copy-D-select, .copy-a-select, .copy-fn-select', function () {
        const profileId     = $(this).data('profile');
        const selectedValue = $(this).val();
        const paramName     = $(this).data('param');

        if (selectedValue && selectedValue.startsWith('copy')) {
            const fromProfile = `profile${selectedValue.replace('copy', '')}`;
            copyParameterValue(fromProfile, profileId, paramName);
            $(this).val('indie'); // reset selection
        }
    });



    function getSharedParamName() {
        const list = $('.shared-checkbox:checked').map(function () {
            return String($(this).data('param'));
        }).get();
        return new Set(list);
    }

    function convertValueByParam($row, paramName, raw) {
        // read active unit from the label dropdown (new UI)
        const $active = $row.find('.param-label-dropdown .dropdown-item.active');
        const unit = ($active.data('unit') || '').toString();  // e.g., 's2','sls','cm-1','s-2','A','m'

        if (raw === "" || raw == null) return "";

        let v = parseFloat(raw);
        if (!Number.isFinite(v)) return raw;

        if (paramName === "SLS") {
            if (unit === "s2") {
                return Math.sqrt(v);
            }
            // 'sls' already backend-native
            return v;
        }

        if (paramName === "Delta2") {
            if (unit === "cm-1") {
                // (cm^-1)^2  ->  s^-2 via (2πc)^2
                return Math.pow(v * TWO_PI_c, 2);
            }
            return v;
        }

        if (paramName === "r" || paramName === "a") {
            if (unit === "A") {
                return v / angstrom;
            }
            return v;
        }

        return v;
    }


    function suffixParam($row, paramName, sharedNames) {
        const uiIsFree = $row.find('.fix-free-switch').is(':checked');
        const base = String(paramName || '').replace(/_$/, '');

        const sharedSet = sharedNames instanceof Set ? sharedNames : new Set(sharedNames || []);
        const effF = uiIsFree ? 'Free' : 'Fix';

        if (sharedSet.has(base)) {
            // Shared parameter: no suffix, no override — normal parameter.
            return { effF, label: base };
        }

        // Not shared: free params keep the '_' suffix; fixed params keep the plain name.
        return { effF, label: uiIsFree ? `${base}_` : base };
    }




    function indexForParam(paramName, isFermiChecked, nextIndexCounter) {
        if (paramName === "Aoh") return 10;
        const i = nextIndexCounter.value;
        if (i === 10) nextIndexCounter.value++;
        const out = nextIndexCounter.value;
        nextIndexCounter.value++;
        return out;
    }



    // $(document).on('change', '.copy-q-select, .copy-C-select, .copy-rho-select, .copy-ms-select, .copy-S-select, .copy-tm-select, .copy-tR-select, .copy-tv-select, .copy-r-select, .copy-Delta2-select, .copy-Aoh-select, .copy-SLS-select, .copy-tl-select, .copy-D-select, .copy-a-select, .copy-fn-select', function () {
    //     const profileId = $(this).data('profile'); // Current profile ID from the dropdown's data attribute
    //     const selectedOption = $(this).val(); // The selected dropdown option
    //     const paramName = $(this).data('param'); // The parameter name (e.g., "Aoh", "D")
    //
    //     if (selectedOption.startsWith('copy')) {
    //         const fromProfile = `profile${selectedOption.replace('copy', '')}`; // Extract the source profile ID
    //
    //         // Copy the parameter value from the source profile to the active profile
    //         copyParameterValue(fromProfile, profileId, paramName);
    //
    //         // Reset the dropdown selection back to 'indie' after copying
    //         $(this).val('indie');
    //     }
    // });



    createParameterFields('profile1');
    updateSelectOptions();


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
        $textarea.val(text.trim());  // initial fill; do NOT mark dirty
        __progSharedUpdate = false;
    }


// Initialize default for first profile
    updateSharedTextarea();
    // If the user edits the textarea, stop all future auto-append behavior
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
<!--                        <input type="text" class="form-control additional-input" placeholder="T">-->
                    </div>
                </a>
            </li>
        `;

        const newTabContent = `
        <div class="tab-pane fade" id="profile${profileCount}" role="tabpanel" aria-labelledby="profile${profileCount}-tab">
            <div class="tab-controls-row">
                <button class="btn btn-sm btn-info toggle-parameters" data-profile="profile${profileCount}">
                    Hide System Parameters
                </button>
                <div class="fit-quality d-none" id="fit-quality-profile${profileCount}"></div>
                <div class="axis-scale d-none" id="axis-scale-profile${profileCount}"></div>
            </div>
        </div>
        `;


        $('#add-tab-container').before(newTab);
        $('#myTabContent').append(newTabContent);

        createParameterFields(`profile${profileCount}`);

        applySharedStateToProfile(`profile${profileCount}`);
        applyFixFreeStateToProfile(`profile${profileCount}`);
        applyUnitStateToProfile(`profile${profileCount}`);
        StateOfProfile(`profile${profileCount}`);

        if (fixFreeState.hasOwnProperty("D")) {
            syncFixFreeAcrossTabs("D", fixFreeState["D"]);
        }

        $('[data-toggle="tooltip"]').tooltip();
        updateTabSelectOptions();
        applyDmodeToProfile(`profile${profileCount}`);




        (function () {
            const $textarea = $('#shared-textarea');
            if (!$textarea.length) return;

            if (sharedTextDirty) return; // user changed it → do nothing

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

        const buttonText = $(this).text() === 'Hide System Parameters' ? 'Show System Parameters' : 'Hide System Parameters';
        $(this).text(buttonText);
    });

    const TWO_PI_c = 2 * 29979245800 * Math.PI;

    function applyAohLogic_corr(data, profileId, isPlotMode = false) {
        const isFermiChecked = $(`#fermiContactTermCheckbox-${profileId}`).is(':checked');

        if (!isFermiChecked) {
            data["F10"]    = "Fix";
            data["Pval10"] = "0";
            data["Pmin10"] = "0";
            data["Pmax10"] = "0";
            return;
        }

        const paramDiv = $(`#${profileId} .parameter-input[data-param="Aoh"]`);
        if (!paramDiv.length) {
            data["F10"]    = "Fix";
            data["Pval10"] = "";
            data["Pmin10"] = "";
            data["Pmax10"] = "";
            return;
        }

        const input = paramDiv.find('input[type="text"]:not([placeholder="min"]):not([placeholder="max"])').val();
        const min   = paramDiv.find('input[placeholder="min"]').val();
        const max   = paramDiv.find('input[placeholder="max"]').val();

        if (isPlotMode) {
            data["F10"]    = "Fix";
            data["Pval10"] = (input !== "" ? (parseFloat(input) * Aoh_conv) : "");
            data["Pmin10"] = "";
            data["Pmax10"] = "";
        } else {
            const fixFree = paramDiv.find('.fix-free-switch').is(':checked') ? "Free" : "Fix";
            data["F10"]    = fixFree;
            data["Pval10"] = (input !== "" ? (parseFloat(input) * Aoh_conv) : "");
            data["Pmin10"] = (min   !== "" ? (parseFloat(min)   * Aoh_conv) : "");
            data["Pmax10"] = (max   !== "" ? (parseFloat(max)   * Aoh_conv) : "");
        }
    }

    function getTabNamesInOrder_corr() {
        return $('.nav-tabs .nav-link').map(function () {
            const $t = $(this);
            const name =
                $t.find('.tab-name, [id$="-name"]').first().text().trim() ||
                $t.text().trim();
            // ignore the "+" add tab button or empty entries
            return name && name !== '+' ? name : null;
        }).get();
    }

    function saveParametersForAllTabs_corr() {
        const $active = $('#myTabContent .tab-pane.active');
        const profileId = $active.attr('id');
        if (!profileId) {
            console.warn('[corr] No active tab found.');
            return Promise.reject('No active tab');
        }

        function SharedRules_corr(data, profileId) {
            const sharedParamName = getSharedParamName();
            const isFermiChecked = $(`#fermiContactTermCheckbox-${profileId}`).is(':checked');

            applyAohLogic_corr(data, profileId, false);

            // Fermi default
            if (isFermiChecked && (!data["Pval10"] || data["Pval10"] === "")) {
                data["Pval10"] = String(10 * Aoh_conv);
                if (!data["F10"]) data["F10"] = "Fix";
            }

            const labelsByIndex = {};
            const nextIdx = { value: 0 };

            // -------- Collect ALL regular parameters using unified logic --------
            $(`#${profileId} .parameter-input`).each(function () {
                const $row = $(this);
                const paramName = String($row.data('param'));

                // Skip Aoh here (handled separately)
                if (paramName === "Aoh") return;

                // Skip D entirely if discrete
                if (paramName === "D" && DmodeState.D === "B") return;

                const index = indexForParam(paramName, isFermiChecked, nextIdx);

                const inputElement = $row.find('input[type="text"]:not([placeholder="min"]):not([placeholder="max"])');
                const minElement   = $row.find('input[placeholder="min"]');
                const maxElement   = $row.find('input[placeholder="max"]');

                let val = convertValueByParam($row, paramName, inputElement.val() || "");
                let min = convertValueByParam($row, paramName, minElement.val() || "");
                let max = convertValueByParam($row, paramName, maxElement.val() || "");

                const { effF, label } = suffixParam($row, paramName, sharedParamName);

                data[`F${index}`]    = effF;
                data[`Pval${index}`] = val;
                data[`Pmin${index}`] = min;
                data[`Pmax${index}`] = max;

                labelsByIndex[index] = label;
            });

            // -------- Handle Aoh separately (it has index 10) --------
            if (isFermiChecked) {
                const $aoh = $(`#${profileId} .parameter-input[data-param="Aoh"]`);
                if ($aoh.length) {
                    const { effF, label } = suffixParam($aoh, 'Aoh', sharedParamName);
                    data['F10'] = effF;
                    labelsByIndex[10] = label;
                } else {
                    labelsByIndex[10] = 'Aoh';
                }
            } else {
                labelsByIndex[10] = 'Aoh';
            }

            // -------- Build Parameter label array --------
            const used = Object.keys(labelsByIndex).map(i => parseInt(i, 10)).sort((a,b)=>a-b);
            if (used.length) {
                const maxIdx = used[used.length - 1];
                const labels = [];
                for (let i = 0; i <= maxIdx; i++) {
                    labels.push(labelsByIndex.hasOwnProperty(i) ? labelsByIndex[i] : "");
                }
                data["Parameters"] = labels;
            }
        }

        const data = {};
        data["ProfileName"] = $(`#${profileId}-name`).text().trim();

        const $acc = $('#shared-textarea');
        let rawInput = ($acc.length ? $acc.val() : "");

        let lines = rawInput.split(/\r?\n/);

        // First internal inject (invisible)
        function injectInternalDataN(rawText) {
            const lines = String(rawText || "").split(/\r?\n/);

            let output = [];
            let blockIndex = 0;

            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];

                if (line.trim().startsWith("# TAG")) {
                    blockIndex++;
                    output.push(`# DATA N=${blockIndex} ${blockIndex}`);
                    output.push(line);
                } else {
                    output.push(line);
                }
            }
            return output.join("\n");
        }

        rawInput = injectInternalDataN(rawInput);

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
            if (!isNaN(parseFloat(parts[0]))) {
                parts[0] = String(parseFloat(parts[0]) * unitFactor);
            }
            if (parts.length === 2) {
                const y = parseFloat(parts[1]);
                if (!isNaN(y)) {
                    parts.push((0.1 * y).toString());
                }
            }
            return parts.join(" ");
        });

        // Collect D values per dataset (per tab)
        const Dvals = {};
        if (DmodeState.D === "B") {
            let idx = 1;
            $('.tab-pane').each(function () {
                const pid = $(this).attr('id');   // e.g. "profile1"
                const selector = `#${pid} .parameter-input[data-param="D"] .param-value`;
                const $inp = $(selector);

                let dval = "";
                if ($inp.length) dval = ($inp.val() || "").trim();

                Dvals[idx] = dval;
                idx++;
            });
        }



        function injectDataN(text) {
            const lns = text.split(/\r?\n/);
            let out = [];
            let counter = 0;

            for (let ln of lns) {
                if (ln.trim().startsWith("# TAG")) {
                    counter++;

                    if (DmodeState.D === "B") {
                        out.push(`# DATA N=${counter} ${counter} ${Dvals[counter] || ""}`);
                    } else {
                        out.push(`# DATA N=${counter} ${counter}`);
                    }
                }
                out.push(ln);
            }
            return out.join("\n");
        }


        data["dados"] = injectDataN(processedLines.join("\n"));

        const isFermiChecked      = $(`#fermiContactTermCheckbox-${profileId}`).is(':checked');
        const isModelFreeChecked  = $(`#modelFreeCheckbox-${profileId}`).is(':checked');
        const isOuterSphereChecked= $(`#outerSphereCheckbox-${profileId}`).is(':checked');

        applyAohLogic_corr(data, profileId, false);

        if (isFermiChecked && (!data["Pval10"] || data["Pval10"] === "")) {
            data["Pval10"] = String(10 * Aoh_conv);
            if (!data["F10"]) data["F10"] = "Fix";
        }

        SharedRules_corr(data, profileId);

        data["ModelFree"]   = isModelFreeChecked ? "true" : "false";
        data["OuterSphere"] = isOuterSphereChecked ? "true" : "false";

        data.AllTabs  = getTabNamesInOrder_corr();
        data.ActiveTab = $(`#${profileId}-name`).text().trim() || profileId;

        const Shared = $(`#${profileId} [id$="-shared"]:checked`).length > 0;

        // Remove D from parameters if discrete
        if (DmodeState.D === "B" && Array.isArray(data.Parameters)) {
            data.Parameters = data.Parameters.filter(label => label !== "D");
        }

        data.ParametersString = data.Parameters.join(", ");

        data["Dmode"] = DmodeState.D;

        return $.ajax({
            type: 'POST',
            url: `/saveTabData_corr`,
            data: JSON.stringify(data),
            contentType: 'application/json'
        });
    }


    function splitAtDataHeaders_corr(text) {
        const src = String(text || "").replace(/\r\n/g, "\n");
        if (!src.trim()) return [];
        return src.split(/\n\s*\n(?=#\s*DATA\b)/g).filter(s => s.trim());
    }



    function saveForPlot_corr() {
        const shared = ($('#shared-textarea').val() || "");
        const blocks = splitAtDataHeaders_corr(shared);

        let saveRequests = [];
        let tabIndex = 1;

        $('.tab-pane').each(function () {
            const profileId = $(this).attr('id');
            const data = {};

            data["ProfileName"] = $(`#${profileId}-name`).text().trim();
            data["Mode"] = "plot";

            // take this tab's block
            const dadosBlock = blocks[tabIndex - 1] || "";

            // === INLINE UNIT HANDLING (mirrors saveParametersForAllTabs_corr) ===
            let processed = "<Add input here>";
            if (dadosBlock.trim()) {
                // split on both \r\n and \n
                let lines = dadosBlock.split(/\r?\n/);

                // detect unit
                let unitFactor = 1;
                const unitLine = lines.find(line => line.trim().toUpperCase().startsWith("# UNIT ="));
                if (unitLine) {
                    const unit = unitLine.split("=")[1]?.trim().toUpperCase();
                    if (unit === "MHZ") unitFactor = 1e6;
                    else if (unit === "HZ") unitFactor = 1;
                }
                function injectInternalDataN(rawText) {
                    const lines = String(rawText || "").split(/\r?\n/);

                    let output = [];
                    let blockIndex = 0;

                    for (let i = 0; i < lines.length; i++) {
                        const line = lines[i];

                        if (line.trim().startsWith("# TAG")) {
                            blockIndex++;
                            output.push(`# DATA N = 1`);
                            output.push(line);
                        } else {
                            output.push(line);
                        }
                    }
                    return output.join("\n");
                }

                // scale first numeric column
                const processedLines = lines.map(line => {
                    const t = line.trim();
                    if (t === "" || t.startsWith("#")) return t;
                    const parts = t.split(/\s+/);
                    const x = parseFloat(parts[0]);
                    if (!Number.isNaN(x)) parts[0] = String(x * unitFactor);
                    if (parts.length === 2) {
                        const y = parseFloat(parts[1]);
                        if (!isNaN(y)) {
                            parts.push((0.1 * y).toString());
                        }
                    }
                    return parts.join(" ");
                });

                // IMPORTANT: keep REAL newlines here; Java will convert to "\n"
                processed = processedLines.join("\n");
            }

            processed = injectInternalDataN(processed);

            data["Dados"] = processed;

            data["ProfileIndex"] = tabIndex; // helps backend label a default block correctly

            const isFermiChecked = $(`#fermiContactTermCheckbox-${profileId}`).is(':checked');
            let paramIndex = 0;

            // --- NEW: prepare labels (so plot saves aren't "undefined" later)
            const labelsByIndex = {};
            const sharedParamName = getSharedParamName();

            // copy parameter values using the shared converter (keeps Å/m and cm⁻¹ handling consistent)
            $(`#${profileId} .parameter-input`).each(function () {
                const $row = $(this);
                const paramName = $row.data('param');
                if (!isFermiChecked && paramName === "Aoh") return;

                let index;
                if (paramName === "Aoh") index = 10;
                else {
                    if (paramIndex === 10) paramIndex++;
                    index = paramIndex++;
                }

                const $val = $row.find('input[type="text"]:not([placeholder="min"]):not([placeholder="max"])');
                const value = convertValueByParam($row, String(paramName), $val.val() || "");

                data[`Pval${index}`] = value;
                data[`F${index}`] = "";
                data[`Pmin${index}`] = "";
                data[`Pmax${index}`] = "";

                // --- NEW: record label for this index (matches _indie.js behavior)
                const { label } = suffixParam($row, String(paramName), sharedParamName);
                labelsByIndex[index] = label;
            });

            // Fermi / Aoh handling (plot mode)
            applyAohLogic_corr(data, profileId, true);

            // --- NEW: ensure Aoh label sits at slot 10 consistently
            if (isFermiChecked) {
                const $aoh = $(`#${profileId} .parameter-input[data-param="Aoh"]`);
                if ($aoh.length) {
                    const { label } = suffixParam($aoh, 'Aoh', sharedParamName);
                    labelsByIndex[10] = label || 'Aoh';
                } else {
                    labelsByIndex[10] = 'Aoh';
                }
            } else {
                // keep label alignment consistent even if Fermi is off
                labelsByIndex[10] = 'Aoh';
            }

            const used = Object.keys(labelsByIndex).map(n => parseInt(n, 10)).sort((a,b)=>a-b);
            if (used.length) {
                const maxI = used[used.length - 1];
                const labels = [];
                for (let i = 0; i <= maxI; i++) labels.push(labelsByIndex[i] || "");
                data["Parameters"] = labels;
                data["ParametersString"] = labels.join(", ");
            }

            // ModelFree and OuterSphere checkboxes
            data["ModelFree"]  = $(`#modelFreeCheckbox-${profileId}`).is(':checked') ? "true" : "false";
            data["OuterSphere"] = $(`#outerSphereCheckbox-${profileId}`).is(':checked') ? "true" : "false";

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



    function renderSamePlotEverywhere(datasetsArr, curvesArr, mode ="fit") {
        $('#myTabContent .tab-pane').each(function () {
            const pid = this.id;
            $(`#${pid}-plots-container`).css('visibility', 'visible');
            plotNewDataMulti_corr(datasetsArr, curvesArr, pid, mode);
        });
    }


    function FormatSciNumb(v) {
        if (v === "" || v === null || typeof v === "undefined") return "";
        const n = Number(v);
        if (!isFinite(n)) return String(v);
        return n.toExponential(4).replace(/e\+?(-?\d+)/i, 'e$1');
    }

    function applyParTableToTab(tabIndex, parTables) {
        if (!parTables || !Array.isArray(parTables) || !parTables[tabIndex]) return;

        const entries = parTables[tabIndex];
        const $tab = $('#myTabContent .tab-pane').eq(tabIndex);
        if ($tab.length === 0) return;

        // do not touch Fix/Free switches anymore (user decides)
        const pid = $tab.attr('id');
        const fermiOn = $(`#fermiContactTermCheckbox-${pid}`).is(':checked');
        const mfOn    = $(`#modelFreeCheckbox-${pid}`).is(':checked');
        const osOn    = $(`#outerSphereCheckbox-${pid}`).is(':checked');

        entries.forEach(e => {
            const uiName = String(e.name || '').replace(/_$/, '');
            if (!uiName || uiName === 'MIXED') return;

            // respect Fermi/MF/OS visibility
            if (!fermiOn && uiName === 'Aoh') return;
            if (!mfOn && (uiName === 'SLS' || uiName === 'tl')) return;
            if (!osOn && (uiName === 'D' || uiName === 'a' || uiName === 'fn')) return;

            const $row = $tab.find(`.parameter-input[data-param="${uiName}"]`);
            if ($row.length === 0) return;

            // update only the numeric fields — never the Fix/Free switch
            const $value = $row.find('input[type="text"]').filter(function () {
                const ph = $(this).attr('placeholder');
                return ph !== 'min' && ph !== 'max';
            }).first();
            if ($value.length) $value.val(FormatSciNumb(e.value));

            const $min = $row.find('input[placeholder="min"]');
            const $max = $row.find('input[placeholder="max"]');
            if ($min.length) $min.val((e.min !== undefined && e.min !== null && e.min !== "") ? FormatSciNumb(e.min) : '');
            if ($max.length) $max.val((e.max !== undefined && e.max !== null && e.max !== "") ? FormatSciNumb(e.max) : '');
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

    // Parse a single fit-curve block: one dataset = one block
    function parseSingleFitCurveBlock_corr(block) {
        const out = [];
        const lines = block.split('\n');
        for (const raw of lines) {
            const trimmed = raw.trim();
            if (!trimmed) continue;

            const parts = trimmed.split(/\s+/).map(Number).filter(n => !isNaN(n));
            if (parts.length >= 2) {
                const x = parts[0];
                const y = parts[parts.length - 1];
                out.push({ x, y });
            }
        }
        return out;
    }

// Normalize fit-curves array/string into clean blocks
    function normalizeFitCurvesBlocks_corr(fitCurves, mode) {
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
        } else {
            return splitByHashBlocks_corr(String(fitCurves));
        }
    }

// Parse multiple fit-curves blocks (main entry for plotting)
    function parseMultiFitCurves_corr(fitCurves, mode = "fit") {
        if (mode === "compare") return fitCurves;
        const blocks = normalizeFitCurvesBlocks_corr(fitCurves, mode);
        return blocks.map(parseSingleFitCurveBlock_corr);
    }

// factor < 1 => zoom in; factor > 1 => zoom out
    function zoom2dBy(gd, factor = 0.7) {
        const full = gd._fullLayout;
        const updates = {};

        ['xaxis', 'yaxis'].forEach((name) => {
            const ax = full[name];
            if (!ax || !ax.range || !Array.isArray(ax.range)) return;

            const r0 = ax.range[0];
            const r1 = ax.range[1];
            const c  = (r0 + r1) / 2;
            const half = (r1 - r0) * factor / 2;   // Works for linear & log axes (log ranges are log10)
            updates[`${ax._name}.range`] = [c - half, c + half];
        });

        Plotly.relayout(gd, updates);
    }

// After Plotly draws, hijack the built-in “Zoom in”
    function overrideZoomInButton(gd, factor = 0.7) {
        const btn =
            gd.querySelector('.modebar .modebar-btn[aria-label="Zoom in"]') ||
            gd.querySelector('.modebar .modebar-btn[data-title="Zoom in"]');
        if (!btn) return;

        btn.addEventListener('click', (ev) => {
            ev.stopImmediatePropagation(); // cancel the stock handler
            ev.preventDefault();
            zoom2dBy(gd, factor);
        }, { capture: true });

        // Update tooltip to reflect your custom step
        btn.setAttribute('aria-label', `Zoom in (${factor}×)`);
        btn.setAttribute('data-title', `Zoom in (${factor}×)`);
    }


    function plotNewDataMulti_corr(datasetsArr, curvesArr, activeTabId, mode = "fit") {
        const traces = [];
        const n = Math.min(
            Array.isArray(datasetsArr) ? datasetsArr.length : 0,
            Array.isArray(curvesArr) ? curvesArr.length : 0
        );

        const colors = Array.from(
            { length: Math.max(n, 1) },
            (_, i) => `hsl(${(i * 360 / Math.max(n, 1))}, 100%, 50%)`
        );

        for (let i = 0; i < n; i++) {
            const ds = datasetsArr[i];
            const cv = curvesArr[i];
            const color = colors[i];

            // --- DATA POINTS (markers) ---
            if (ds?.data?.length) {
                traces.push({
                    x: ds.data.map(p => p.x),
                    y: ds.data.map(p => p.y),
                    mode: 'markers',
                    type: 'scatter',
                    name: `Data points ${i + 1}`,
                    marker: { color },
                    visible: (mode === 'plot') ? 'legendonly' : true
                });
            }

            // --- FIT LINES ---
            if (Array.isArray(cv) && cv.length) {
                traces.push({
                    x: cv.map(p => p.x),
                    y: cv.map(p => p.y),
                    mode: 'lines',
                    type: 'scatter',
                    name: `Fit Curve ${i + 1}`,
                    line: { color, width: 2 }
                });
            }
        }

        const layout = {
            xaxis: { title: { text: 'Larmor Frequency [Hz]' }, type: 'log', autorange: true, tickmode: 'auto', dtick: 1, tickformat: '.0e', minor: {show: true, dtick: 0.69897 } },
            yaxis: { title: { text: 'Relaxation rate [1/s]' }, autorange: true }
        };

        const plotId = `${activeTabId}-plot`;
        $(`#${activeTabId}-plots-container`).css('visibility', 'visible');

        if (mode === "plot") {
            for (const t of traces) {
                if (t && t.mode === 'markers') t.visible = 'legendonly';
            }
        }


        Plotly.react(plotId, traces, layout);
        const gd = document.getElementById(plotId);
        if (gd) setTimeout(() => overrideZoomInButton(gd, 0.7), 0);

    }




    // function fetchDataAndPlot_corr(jsonFileName, activeTabId, mode = "fit") {
    //     console.log(`[CORR] Fetching ${jsonFileName} for mode = ${mode}`);
    //
    //     const url = `/files/${jsonFileName}?timestamp=${Date.now()}`;
    //     $.ajax({
    //         url: url,
    //         method: 'GET',
    //         dataType: 'json',
    //         cache: false,
    //         success: function (data) {
    //             if (!data || !data["Dados"]) {
    //                 alert("No 'Dados' field found in the mixed JSON file.");
    //                 console.warn("Invalid mixed JSON:", data);
    //                 return;
    //             }
    //
    //             const datasetsArr = parseDadosforPlot_corr(data["Dados"]);
    //             const fitCurvesRaw = data["fit-curves"];
    //             const modeUsed = mode;
    //
    //             // Ensure only active tab is updated
    //             const plotDiv = `${activeTabId}-plot`;
    //             $(`#${activeTabId}-plots-container`).css('visibility', 'visible');
    //
    //             if (modeUsed === "compare") {
    //                 // Parse y1 (IS) and y2 (OS) from fit-curves
    //                 const ISOS = fitCurvesRaw
    //                     ? parseFitCurvesISOS(Array.isArray(fitCurvesRaw) ? fitCurvesRaw : [fitCurvesRaw])
    //                     : { IS: [], OS: [] };
    //
    //                 const traces = [];
    //
    //                 if (ISOS.IS.length) {
    //                     traces.push({
    //                         x: ISOS.IS.map(p => p.x),
    //                         y: ISOS.IS.map(p => p.y),
    //                         mode: 'lines',
    //                         type: 'scatter',
    //                         name: 'IS',
    //                         line: { color: 'blue', width: 2 }
    //                     });
    //                 }
    //
    //                 if (ISOS.OS.length) {
    //                     traces.push({
    //                         x: ISOS.OS.map(p => p.x),
    //                         y: ISOS.OS.map(p => p.y),
    //                         mode: 'lines',
    //                         type: 'scatter',
    //                         name: 'OS',
    //                         line: { color: 'red', dash: 'dot', width: 2 }
    //                     });
    //                 }
    //
    //                 const layout = {
    //                     title: 'IS/OS Contributions (Active Tab)',
    //                     xaxis: { title: 'Frequency [Hz]', type: 'log', tickformat: '.0e' },
    //                     yaxis: { title: 'Contribution [a.u.]' },
    //                     showlegend: true
    //                 };
    //
    //                 Plotly.react(plotDiv, traces, layout);
    //             } else {
    //                 // Normal fit mode (entire fit curve)
    //                 const curvesArr = fitCurvesRaw ? parseMultiFitCurves_corr(fitCurvesRaw, modeUsed) : [];
    //                 plotNewDataMulti_corr(datasetsArr, curvesArr, activeTabId, modeUsed);
    //             }
    //
    //             // Once loaded, enable the “C” button again
    //             $('#switch-plot').show().prop('disabled', false);
    //         },
    //
    //         error: function (xhr, status, error) {
    //             alert("Error fetching _mixed.json. Please ensure it exists.");
    //             console.error("[CORR] Fetch failed:", status, error);
    //         }
    //     });
    // }

    function corr_plotNormalForActiveTab() {
        const activeTabId = $('#myTabContent .tab-pane.active').attr('id');
        if (!__corrLastFitJson) { alert('Run Fit first.'); return; }

        const datasetsArr = parseDadosforPlot_corr(__corrLastFitJson["Dados"]);
        const curvesArr   = parseMultiFitCurves_corr(__corrLastFitJson["fit-curves"], "fit");
        $(`#${activeTabId}-plots-container`).css('visibility','visible');
        plotNewDataMulti_corr(datasetsArr, curvesArr, activeTabId, "fit");
    }

    function corr_plotContribForActiveTab() {
        const activeTabId = $('#myTabContent .tab-pane.active').attr('id');
        if (!__corrLastFitJson) { alert('Run Fit first.'); return; }

        // --- figure out active profile index (0-based) ---
        const tabIdx = Math.max(0, (parseInt((activeTabId || '').replace('profile',''), 10) || 1) - 1);

        // --- DATA POINTS for this tab only ---
        const datasetsArr = parseDadosforPlot_corr(__corrLastFitJson["Dados"]);
        const ds = Array.isArray(datasetsArr) ? (datasetsArr[tabIdx] || datasetsArr[0]) : null;

        // --- IS/OS for this tab only ---
        const fitCurvesRaw = __corrLastFitJson["fit-curves"];

        // Normalize into per-profile blocks in the same way as your "fit" path,
        // then pick only the block for the active tab.
        const perProfileBlocks = normalizeFitCurvesBlocks_corr(fitCurvesRaw, "fit"); // returns an array of blocks
        const blockForTab = Array.isArray(perProfileBlocks) ? perProfileBlocks[tabIdx] : null;

        // Parse IS (2nd column) and OS (3rd column) just for that one block
        const { IS, OS } = blockForTab
            ? parseFitCurvesISOS([blockForTab])
            : { IS: [], OS: [] };

        // --- assemble traces (Data Points + IS + OS) ---
        const traces = [];

        if (ds && ds.data && ds.data.length) {
            traces.push({
                x: ds.data.map(p => p.x),
                y: ds.data.map(p => p.y),
                mode: 'markers',
                type: 'scatter',
                name: 'Data Points',
                visible: true,
            });
        }

        if (IS.length) {
            traces.push({
                x: IS.map(p => p.x),
                y: IS.map(p => p.y),
                mode: 'lines',
                type: 'scatter',
                name: 'IS',
                line: { width: 2 }
            });
        }

        if (OS.length) {
            traces.push({
                x: OS.map(p => p.x),
                y: OS.map(p => p.y),
                mode: 'lines',
                type: 'scatter',
                name: 'OS',
                line: { dash: 'dot', width: 2 }
            });
        }

        const layout = {
            // title: { text: `NMRD Contributions — ${activeTabId}` },
            xaxis: { title: { text: 'Larmor Frequency [Hz]' }, type: 'log', autorange: true, tickformat: '.0e' },
            yaxis: { title: { text: 'Relaxation rate [1/s]' }, autorange: true },
            showlegend: true
        };

        const plotId = `${activeTabId}-plot`;
        $(`#${activeTabId}-plots-container`).css('visibility', 'visible');

        Plotly.react(plotId, traces, layout);
        const gd = document.getElementById(plotId);
        if (gd) setTimeout(() => overrideZoomInButton(gd, 0.7), 0);
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
                if (parts.length < 4) return; // must have x + at least 3 values

                const x = parts[0];
                const y1 = parts[1]; // take the 2nd numeric value (index 2)
                const y2 = parts[2]; // take the 3rd numeric value (index 3)

                if (!isNaN(x) && !isNaN(y1)) IS.push({ x, y: y1 });
                if (!isNaN(x) && !isNaN(y2)) OS.push({ x, y: y2 });
            });
        });

        return { IS, OS };
    }

    $('#submit-button').on('click', saveParametersForAllTabs_corr);
    // $('#submit-button').on('click', saveForPlot_corr);



    $(document).ready(function () {
        $('#fit-button').off('click').on('click', function () {
            console.log('[FIT] Saving UI to *_mixed.json, then running /fit_corr ...');

            $('#fit-button, #plot-button, #switch-plot, #close-plot').prop('disabled', true);
            $('#fit-spinner-overlay').removeClass('d-none').addClass('d-flex');

            const $activeTab = $('#myTabContent .tab-pane.active');
            const activeTabId = $activeTab.attr('id');

            const toExp5 = (v) => {
                if (v === '' || v == null) return '';
                const n = Number(v);
                if (!isFinite(n)) return String(v);
                return n.toExponential(5).replace(/e\+?(-?\d+)/i, 'e$1');
            };

            const convForUi = (name, raw, $row) => {
                if (raw === '' || raw == null) return '';
                const x = parseFloat(raw);
                if (!isFinite(x)) return '';

                if (name === 'SLS') {
                    const unitSel = String(
                        $row.find('.param-label-dropdown .dropdown-item.active').data('unit') || 's2'
                    );
                    if (unitSel === 's2') {
                        return x * x;
                    }
                    return x;
                }

                const unit = String(
                    $row.find('.param-label-dropdown .dropdown-item.active').data('unit') || ''
                );

                if (name === 'Delta2') {
                    if (unit === 'cm-1') {
                        return Math.sqrt(x) / TWO_PI_c;
                    } else if (unit === 'ts0') {
                        return x;
                    } else {
                        return x;
                    }
                }
                if (name === 'r' || name === 'a') {
                    if (unit === 'A') return x * angstrom;
                    return x;
                }

                if (name === "Aoh") return x / Aoh_conv;

                return x;
            };

            function ErrorCorr(fitJson) {
                const fitResults = fitJson && fitJson['fit-results'];
                if (typeof fitResults !== 'string') {
                    console.warn('[ErrorCorr] No fit-results found.');
                    return;
                }

                const lines = fitResults.trim().split(/\r?\n/);
                if (lines.length < 2) {
                    console.warn('[ErrorCorr] fit-results has no data rows.');
                    return;
                }

                // Header row: "# TAG, Npts, R², chi2, N_1, N_2, q, ±err, C, ±err, ..."
                const header = lines[0].split(',').map(s => s.trim());

                // Columns from index 6 onwards are [param, ±err] pairs
                const paramColumns = [];
                let col = 6;
                while (col + 1 < header.length) {
                    const backendName = header[col];
                    const errLabel    = header[col + 1]; // should be "±err"

                    if (backendName && backendName !== '±err') {
                        paramColumns.push({
                            backendName,
                            valueCol: col,
                            errCol:   col + 1
                        });
                    }
                    col += 2;
                }

                // Map backend names that have "ref" suffixes to UI param ids
                const nameMap = {
                    tmref: 'tm',
                    tvref: 'tv',
                    trref: 'tR',
                    tlref: 'tl'
                };

                const $tabs = $('#myTabContent .tab-pane');

                $tabs.each(function (tabIdx) {
                    const $tab = $(this);
                    const pid  = $tab.attr('id');

                    // Each profile/tab corresponds to one data line:
                    // line 1 → Profile 1, line 2 → Profile 2, ...
                    const line = lines[tabIdx + 1];
                    if (!line) return;

                    const cols = line.split(',').map(s => s.trim());
                    if (cols.length <= 6) return;

                    const fermiOn = $(`#fermiContactTermCheckbox-${pid}`).is(':checked');
                    const mfOn    = $(`#modelFreeCheckbox-${pid}`).is(':checked');
                    const osOn    = $(`#outerSphereCheckbox-${pid}`).is(':checked');

                    paramColumns.forEach(({ backendName, errCol }) => {
                        if (errCol >= cols.length) return;

                        const rawErr = cols[errCol];

                        // skip non-numeric fields like "fixed", "constant", or empty
                        if (!rawErr) return;
                        const lower = rawErr.toLowerCase();
                        if (lower === 'fixed' || lower === 'constant') return;

                        const errBackend = Number(rawErr);
                        if (!Number.isFinite(errBackend)) return;

                        // Map backend label -> UI data-param
                        let uiName = String(backendName || '').replace(/_$/, '');
                        if (Object.prototype.hasOwnProperty.call(nameMap, uiName)) {
                            uiName = nameMap[uiName];
                        }

                        // No UI rows for these
                        if (uiName === 'Tref' || uiName === 'MIXED') return;

                        // respect feature toggles
                        if (!fermiOn && uiName === 'Aoh') return;
                        if (!mfOn    && (uiName === 'SLS' || uiName === 'tl')) return;
                        if (!osOn    && (uiName === 'D'   || uiName === 'a'  || uiName === 'fn')) return;

                        const $row = $tab.find(`.parameter-input[data-param="${uiName}"]`);
                        if ($row.length === 0) return;

                        // convert error to UI units (SLS, Δ², r, a, etc.)
                        const errUi = convForUi(uiName, errBackend, $row);
                        const errNum = parseFloat(errUi);

                        const $err = $row.find('input.param-error');
                        if (!$err.length) return;

                        if (Number.isFinite(errNum)) {
                            $err.val(errNum.toExponential(5).replace(/e\+?(-?\d+)/i, 'e$1'));
                        } else {
                            $err.val('');
                        }
                    });
                });
            }


            saveParametersForAllTabs_corr()
                .then(() => {
                    console.log('[FIT] Starting correction fit...');
                    const hasShared = $('[id$="-shared"]:checked').length > 0;
                    return $.ajax({ url: `/fit_corr?shared=${hasShared ? 'yes' : 'no'}`, method: 'POST' });
                })
                .then((response) => {
                    console.log('[FIT] /fit_corr finished successfully.');

                    let fitJson;
                    try {
                        fitJson = (typeof response === 'string') ? JSON.parse(response) : response;
                    } catch (err) {
                        console.error('[FIT] Could not parse JSON:', err, response);
                        alert('Fit failed: invalid JSON from server.');
                        return;
                    }

                    const parTables = Array.isArray(fitJson['par-tables']) ? fitJson['par-tables'] : null;
                    if (!parTables) {
                        console.warn('[FIT] No par-tables found in response JSON.');
                    } else {
                        console.log('[FIT] Applying fitted parameters to all tabs (with conversions)…');
                        const $tabs = $('#myTabContent .tab-pane');

                        $tabs.each(function (tabIdx) {
                            const $tab = $(this);
                            if (!parTables[tabIdx]) return;

                            const pid = $tab.attr('id');
                            const fermiOn = $(`#fermiContactTermCheckbox-${pid}`).is(':checked');
                            const mfOn    = $(`#modelFreeCheckbox-${pid}`).is(':checked');
                            const osOn    = $(`#outerSphereCheckbox-${pid}`).is(':checked');

                            parTables[tabIdx].forEach(entry => {
                                const uiName = String(entry.name || '').replace(/_$/, '');
                                if (!uiName || uiName === 'MIXED') return;

                                if (!fermiOn && uiName === 'Aoh') return;
                                if (!mfOn && (uiName === 'SLS' || uiName === 'tl')) return;
                                if (!osOn && (uiName === 'D' || uiName === 'a' || uiName === 'fn')) return;

                                const $row = $tab.find(`.parameter-input[data-param="${uiName}"]`);
                                if ($row.length === 0) return;

                                const val  = convForUi(uiName, entry.value, $row);
                                const vmin = convForUi(uiName, entry.min, $row);
                                const vmax = convForUi(uiName, entry.max, $row);

                                const errConv = convForUi(uiName, entry.err, $row);
                                const errNum  = parseFloat(errConv);
                                const $err    = $row.find('input.param-error');
                                if ($err.length) {
                                    if (Number.isFinite(errNum)) {
                                        $err.val(errNum.toExponential(5).replace(/e\+?(-?\d+)/i, 'e$1'));
                                    } else {
                                        $err.val('');
                                    }
                                }

                                const $value = $row.find('input[type="text"]').filter(function () {
                                    const ph = $(this).attr('placeholder');
                                    return ph !== 'min' && ph !== 'max';
                                }).first();
                                if ($value.length) $value.val(val === '' ? '' : toExp5(val));

                                const $min = $row.find('input[placeholder="min"]');
                                const $max = $row.find('input[placeholder="max"]');
                                if ($min.length) $min.val(vmin === '' ? '' : toExp5(vmin));
                                if ($max.length) $max.val(vmax === '' ? '' : toExp5(vmax));
                            });
                        });
                    }

                    $(`#${activeTabId}-plots-container`).css('visibility', 'visible');

                    __corrLastFitJson = fitJson;

                    const datasetsArr = parseDadosforPlot_corr(fitJson["Dados"]);
                    const curvesArr   = parseMultiFitCurves_corr(fitJson["fit-curves"], "fit");

                    renderSamePlotEverywhere(datasetsArr, curvesArr);

                    $('#myTabContent .tab-pane').each(function (tabIdx) {
                        const pid = this.id;
                        updateCorrFitQuality(pid, fitJson, tabIdx);
                        setAxisScaleUIVisible(pid, true);
                    });

                    ErrorCorr(fitJson);

                })
                .catch((err) => {
                    if (err && (err.statusText === 'abort' || err === 'abort')) {
                        console.log('[CORR] aborted by user');
                        return;
                    }
                    const msg = (err && (err.responseText || err.statusText)) ? String(err.responseText || err.statusText) : 'Unknown error';
                    console.error('[CORR] error:', err);
                    console.log('Fit failed:', msg);
                })
                .always(() => {
                    // Re-enable UI and hide spinner
                    $('#fit-button, #plot-button, #switch-plot, #close-plot').prop('disabled', false);
                    $('#fit-spinner-overlay').addClass('d-none').removeClass('d-flex');
                });
        });



        $('#close-plot').on('click', function () {
            const activeTabId = $('#myTabContent .tab-pane.active').attr('id'); // Get active tab
            Plotly.purge(`${activeTabId}-plot`);
            $(`#${activeTabId}-plots-container`).css('visibility', 'hidden');
            console.log(`Plot for ${activeTabId} has been cleared and hidden.`);
        });

        (function () {
            const __corrCompareModeByTab = {};

            $('#switch-plot').off('click').on('click', function () {
                const activeTabId = $('#myTabContent .tab-pane.active').attr('id');
                __corrCompareModeByTab[activeTabId] = !__corrCompareModeByTab[activeTabId];

                if (__corrCompareModeByTab[activeTabId]) {
                    // C mode → swap to y1/y2 from fit-curves
                    corr_plotContribForActiveTab();
                } else {
                    // back to normal fit plot
                    corr_plotNormalForActiveTab();
                }
            });
        })();




        $('#plot-button').off('click').on('click', function () {
            const setSpin = on => $('#fit-spinner-overlay').toggleClass('d-none', !on).toggleClass('d-flex', on);
            const setDis  = d  => $('#fit-button, #plot-button, #switch-plot, #close-plot').prop('disabled', d);

            setDis(true);
            setSpin(true);

            saveForPlot_corr()
                .then(() => $.ajax({ url: '/fit', method: 'POST' }))   // ✅ same as _indie
                .then(() => $.ajax({ url: '/files/list', method: 'GET', dataType: 'json', cache: false }))
                .then((files) => {
                    // pick the latest timestamped json for each visible profile N (like _indie_)
                    const tabCount = $('#myTabContent .tab-pane').length;
                    const picks = [];

                    for (let i = 1; i <= tabCount; i++) {
                        const rx = new RegExp(`^\\d{8}_\\d{4}_indie_profile${i}\\.json$`);
                        const matches = files.filter(f => rx.test(f));
                        if (matches.length === 0) continue;
                        matches.sort();                 // YYYYMMDD_HHMM sorts lexicographically
                        picks.push(matches[matches.length - 1]); // latest for this profile
                    }

                    if (picks.length === 0) {
                        throw new Error('No profile JSON files found after /fit.');
                    }

                    // fetch each chosen file (each contains Dados + fit-curves for that profile)
                    const fetches = picks.map(name =>
                        $.ajax({ url: `/files/${name}?ts=${Date.now()}`, method: 'GET', dataType: 'json', cache: false })
                    );
                    return Promise.all(fetches);
                })
                .then((jsons) => {
                    // Combine all Dados and all fit-curves from the loaded files
                    const dadosBlocks = [];
                    const fitBlocks   = [];

                    jsons.forEach(j => {
                        if (j && j['Dados']) dadosBlocks.push(j['Dados']);

                        const fc = j && j['fit-curves'];
                        if (!fc) return;
                        if (Array.isArray(fc)) fitBlocks.push(fc.map(String));
                        else fitBlocks.push(String(fc));
                    });

                    // Use existing parsers in _corr_
                    const dadosJoined = dadosBlocks.join('\n\n');
                    const datasetsArr = parseDadosforPlot_corr(dadosJoined);             // already in corr  :contentReference[oaicite:1]{index=1}
                    const curvesArr   = parseMultiFitCurves_corr(fitBlocks, 'fit');      // already in corr  :contentReference[oaicite:2]{index=2}

                    __corrLastFitJson = {
                        "Dados": dadosJoined,
                        "fit-curves": fitBlocks
                    };

                    // Mirror ONE identical plot onto every tab (uses your existing palette/order)
                    renderSamePlotEverywhere(datasetsArr, curvesArr, "plot");                    // already in corr  :contentReference[oaicite:3]{index=3}
                })
                .catch((err) => {
                    if (err && (err.statusText === 'abort' || err === 'abort')) {
                        console.log('[CORR] aborted by user');
                        return;
                    }
                    const msg = (err && (err.responseText || err.statusText)) ? String(err.responseText || err.statusText) : 'Unknown error';
                    console.error('[CORR] error:', err);
                    console.log('Fit failed:', msg);
                })
                .finally(() => {
                    setSpin(false);
                    setDis(false);
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
        );
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

    function showExportError(msg) {
        alert(msg);
    }

    function getActiveProfileId() {
        return $('#myTabContent .tab-pane.active').attr('id') || 'profile1';
    }

    function getProfileIndex(profileId) {
        const m = String(profileId).match(/profile(\d+)/i);
        return m ? parseInt(m[1], 10) : 1;
    }

    function getActiveProfileName(profileId) {
        const label = $(`#${profileId}-name`).text();
        return sanitize(label || profileId);
    }

    function getFixFree($row) {
        return $row.find('.fix-free-switch').is(':checked') ? 'Free' : 'Fix';
    }

    function getGraphDiv(profileId) {
        const pane = $('#' + profileId);
        return pane.find('.js-plotly-plot').get(0) || null;
    }

    function hasAnyPlot(profileId) {
        const gd = getGraphDiv(profileId);
        if (!gd || !gd.data) return false;

        const idx = getProfileIndex(profileId);

        const hasData = gd.data.some(t =>
            new RegExp(`^Data\\s*points\\s*${idx}$`, 'i').test(String(t.name || ''))
        );

        const hasFit = gd.data.some(t =>
            new RegExp(`^Fit\\s*Curve\\s*${idx}$`, 'i').test(String(t.name || ''))
        );

        return hasData || hasFit;
    }

    function getFitQuality(profileId) {
        const $box = $(`#fit-quality-${profileId}`);
        if (!$box.length) return { chi2: '', R2: '' };

        const tds = $box.find('td');
        if (tds.length >= 4) {
            return {
                chi2: $(tds[1]).text().trim(),
                R2:   $(tds[3]).text().trim()
            };
        }
        return { chi2: '', R2: '' };
    }

    function getDataFromPlot(profileId) {
        const gd = getGraphDiv(profileId);
        if (!gd || !gd.data) return { x: [], y: [], yerr: [] };

        const idx = getProfileIndex(profileId);

        const tData = gd.data.find(t =>
            new RegExp(`^Data\\s*points\\s*${idx}$`, 'i')
                .test(String(t.name || ''))
        );

        if (!tData) return { x: [], y: [], yerr: [] };

        const errArr =
            (tData.error_y && Array.isArray(tData.error_y.array))
                ? tData.error_y.array
                : [];

        return {
            x: tData.x.slice(),
            y: tData.y.slice(),
            yerr: errArr.slice()
        };
    }

    function getFitFromPlot(profileId) {
        const gd = getGraphDiv(profileId);
        if (!gd || !gd.data) return { x: [], y1: [], y2: [], hasTwo: false };

        const idx = getProfileIndex(profileId);

        const tIS = gd.data.find(t =>
            new RegExp(`^IS\\s*${idx}$`, 'i')
                .test(String(t.name || ''))
        );

        const tOS = gd.data.find(t =>
            new RegExp(`^OS\\s*${idx}$`, 'i')
                .test(String(t.name || ''))
        );

        if (tIS && tOS) {
            return {
                x: tIS.x.slice(),
                y1: tIS.y.slice(),
                y2: tOS.y.slice(),
                hasTwo: true
            };
        }

        const tFit = gd.data.find(t =>
            new RegExp(`^Fit\\s*Curve\\s*${idx}$`, 'i')
                .test(String(t.name || ''))
        );

        if (!tFit) return { x: [], y1: [], y2: [], hasTwo: false };

        return {
            x: tFit.x.slice(),
            y1: tFit.y.slice(),
            y2: [],
            hasTwo: false
        };
    }

    function exportParametersCsv_corr() {

        const profileId = getActiveProfileId();

        if (!hasAnyPlot(profileId)) {
            showExportError('Export error: no plot for this tab.');
            return;
        }

        const ts = makeTimestamp();
        const filename = `${ts}_corr_${getActiveProfileName(profileId)}.csv`;

        const paramRows = [];
        $(`#${profileId} .parameter-input`).each(function () {
            const $row = $(this);
            const param = String($row.data('param') || '').trim();
            if (!param) return;

            const value = $row.find('.param-value').val();
            const errorRaw = $row.find('.param-error').val();
            const error = (!errorRaw || String(errorRaw).trim() === '') ? 'na' : errorRaw;

            paramRows.push({
                param,
                fixfree: getFixFree($row),
                value,
                error
            });
        });

        const { chi2, R2 } = getFitQuality(profileId);
        const fit = getFitFromPlot(profileId);
        const dat = getDataFromPlot(profileId);

        const header = [
            'Parameter','Fix/Free','Value','Error','chi2','R2',
            '','',
            'fit_x',
            (fit.hasTwo ? 'fit_y1' : 'fit_y'),
            (fit.hasTwo ? 'fit_y2' : ''),
            '','',
            'data_x','data_y'
        ];

        const maxLen = Math.max(paramRows.length, fit.x.length, dat.x.length);

        const lines = [];
        lines.push(rowToCsv(header));

        for (let i = 0; i < maxLen; i++) {

            const p = paramRows[i] || {};

            const chi2Cell = (i === 0) ? chi2 : '';
            const r2Cell   = (i === 0) ? R2   : '';

            lines.push(rowToCsv([
                p.param || '',
                p.fixfree || '',
                p.value || '',
                p.error || '',
                chi2Cell,
                r2Cell,
                '', '',
                fit.x[i]  ?? '',
                fit.y1[i] ?? '',
                (fit.hasTwo ? (fit.y2[i] ?? '') : ''),
                '', '',
                dat.x[i]  ?? '',
                dat.y[i]  ?? ''
            ]));
        }

        const blob = new Blob([lines.join('\n') + '\n'], { type: 'text/csv;charset=utf-8' });
        downloadBlob(blob, filename);
    }

    $(document)
        .off('click.exportCsvCorr', '#export-button')
        .on('click.exportCsvCorr', '#export-button', function (e) {
            e.preventDefault();
            e.stopPropagation();
            exportParametersCsv_corr();
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



