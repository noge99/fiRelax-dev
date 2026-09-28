package com.firelax;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.*;

import java.io.*;
import java.text.SimpleDateFormat;
import java.util.*;
import java.util.Map;
import java.util.stream.Collectors;
import java.util.HashSet;
import java.util.Set;
import java.util.concurrent.atomic.AtomicReference;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;


@Controller
public class HomeController {

    private final java.util.concurrent.atomic.AtomicReference<Process> currentFitProc =
            new java.util.concurrent.atomic.AtomicReference<>();

    @GetMapping({"/","/index"})
    public String index() {
        return "index";
    }

    @PostMapping("/saveTabData/{profileIndex}")
    @ResponseBody
    public ResponseEntity<Map<String, String>> saveTabData(@PathVariable String profileIndex, @RequestBody Map<String, Object> data) {
        String jsonDir = "/home/ofe/public_html/json/";
        File directory = new File(jsonDir);

        if (!directory.exists()) {
            directory.mkdirs();
        }

        // Get all files related to the profileIndex
        File[] existingFiles = directory.listFiles((dir, name) -> name.contains("_" + profileIndex + ".json"));

        // If there are existing files, delete the oldest one
        if (existingFiles != null && existingFiles.length > 0) {
            Arrays.sort(existingFiles, Comparator.comparingLong(File::lastModified)); // Sort by timestamp
            existingFiles[0].delete(); // Delete the oldest file
            System.out.println("Deleted old JSON file: " + existingFiles[0].getName());
        }

        // Generate a new JSON filename with a timestamp
        String timestamp = new SimpleDateFormat("yyyyMMdd_HHmm").format(new Date());
        String jsonFileName = timestamp + "_" + profileIndex + ".json";
        String jsonFilePath = jsonDir + jsonFileName;

        try (FileWriter file = new FileWriter(jsonFilePath)) {
            String jsonContent = generateJSON(data);
            file.write(jsonContent);

            Map<String, String> response = new HashMap<>();
            response.put("message", "Data saved successfully.");
            response.put("filename", jsonFileName);
            return ResponseEntity.ok(response);
        } catch (IOException e) {
            e.printStackTrace();
            return ResponseEntity.status(500).body(Map.of("message", "Failed to save data."));
        }
    }

    @PostMapping("/saveTabData_florence/{profileIndex}")
    @ResponseBody
    public ResponseEntity<Map<String, String>> saveTabData_florence(@PathVariable String profileIndex, @RequestBody Map<String, Object> data) {
        return saveTabData_florences(profileIndex, data, "florence", "1");
    }

    @PostMapping("/saveTabData_modflorence/{profileIndex}")
    @ResponseBody
    public ResponseEntity<Map<String, String>> saveTabData_modflorence(@PathVariable String profileIndex, @RequestBody Map<String, Object> data) {
        return saveTabData_florences(profileIndex, data, "modflorence", "2");
    }

    /**
     * Shared save-and-generate-JSON handler for the Florence models.
     *
     * @param profileIndex path variable from the endpoint (kept for API symmetry; not used in the filename)
     * @param data         request body from the UI
     * @param variant      "florence" or "modflorence" — controls the file suffix
     *                     (*_florence_indie.json vs *_modflorence_indie.json)
     * @param modelFlag    "1" for Florence, "2" for Modified Florence — injected into the JSON's last parameter slot
     */
    private ResponseEntity<Map<String, String>> saveTabData_florences(String profileIndex,
                                                                      Map<String, Object> data,
                                                                      String variant,
                                                                      String modelFlag) {
        String jsonDir = "/home/ofe/public_html/json/";
        File directory = new File(jsonDir);

        if (!directory.exists()) {
            directory.mkdirs();
        }

        final String fileSuffix = variant + "_indie.json";

        // Get all files related to this variant
        File[] existingFiles = directory.listFiles((dir, name) -> name.contains("_" + fileSuffix));

        // If there are existing files, delete the oldest one
        if (existingFiles != null && existingFiles.length > 0) {
            Arrays.sort(existingFiles, Comparator.comparingLong(File::lastModified)); // Sort by timestamp
            existingFiles[0].delete(); // Delete the oldest file
            System.out.println("Deleted old JSON file: " + existingFiles[0].getName());
        }

        // Generate a new JSON filename with a timestamp
        String timestamp = new SimpleDateFormat("yyyyMMdd_HHmm").format(new Date());
        String jsonFileName = timestamp + "_" + fileSuffix;
        String jsonFilePath = jsonDir + jsonFileName;

        try (FileWriter file = new FileWriter(jsonFilePath)) {
            data.put("ModelFlag", modelFlag);
            String jsonContent = generateJSON_Florence(data);
            file.write(jsonContent);

            Map<String, String> response = new HashMap<>();
            response.put("message", "Data saved successfully.");
            response.put("filename", jsonFileName);
            return ResponseEntity.ok(response);
        } catch (IOException e) {
            e.printStackTrace();
            return ResponseEntity.status(500).body(Map.of("message", "Failed to save data."));
        }
    }

    @PostMapping("/saveTabData_corr")
    @ResponseBody
    public ResponseEntity<Map<String, String>> saveTabData_corr(@RequestBody Map<String, Object> data) {
        String jsonDir = "/home/ofe/public_html/json/";
        File directory = new File(jsonDir);
        if (!directory.exists()) directory.mkdirs();

        // keep only one mixed file: delete the oldest *_mixed.json if present
        File[] existing = directory.listFiles((dir, name) -> name.endsWith("_mixed.json"));
        if (existing != null && existing.length > 0) {
            Arrays.sort(existing, Comparator.comparingLong(File::lastModified));
            existing[0].delete();
        }

        String timestamp = new SimpleDateFormat("yyyyMMdd_HHmm").format(new Date());
        String jsonFileName = timestamp + "_mixed.json";
        String jsonFilePath = jsonDir + jsonFileName;

        try (FileWriter file = new FileWriter(jsonFilePath)) {
            String jsonContent = generateJSON_corr(data);
            file.write(jsonContent);
            return ResponseEntity.ok(Map.of("message", "Correlated data saved successfully.", "filename", jsonFileName));
        } catch (IOException e) {
            e.printStackTrace();
            return ResponseEntity.status(500).body(Map.of("message", "Failed to save correlated data."));
        }
    }

    @PostMapping("/saveTabData_svante")
    @ResponseBody
    public ResponseEntity<Map<String, String>> saveTabData_svante(@RequestBody Map<String, Object> data) {
        String jsonDir = "/home/ofe/public_html/json/";
        File directory = new File(jsonDir);
        if (!directory.exists()) directory.mkdirs();

        // keep only one mixed file: delete the oldest *_mixed.json if present
        File[] existing = directory.listFiles((dir, name) -> name.endsWith("_arrhenius.json"));
        if (existing != null && existing.length > 0) {
            Arrays.sort(existing, Comparator.comparingLong(File::lastModified));
            existing[0].delete();
        }

        String timestamp = new SimpleDateFormat("yyyyMMdd_HHmm").format(new Date());
        String jsonArrheniusFileName = timestamp + "_arrhenius.json";
        String jsonFilePath = jsonDir + jsonArrheniusFileName;

        try (FileWriter file = new FileWriter(jsonFilePath)) {
            String jsonContent = generateJSON_svante(data);
            file.write(jsonContent);
            return ResponseEntity.ok(Map.of("message", "Correlated data saved successfully.", "filename", jsonArrheniusFileName));
        } catch (IOException e) {
            e.printStackTrace();
            return ResponseEntity.status(500).body(Map.of("message", "Failed to save correlated data."));
        }
    }



    @GetMapping("/data")
    @ResponseBody

    private String generateJSON(Map<String, Object> data) {
        StringBuilder jsonBuilder = new StringBuilder("{\n");

        String mode = (String) data.get("Mode");
        boolean isPlot = "plot".equalsIgnoreCase(mode);

        int i = 0;
        while (data.containsKey("F" + i) || data.containsKey("Pval" + i)) {
            String keyF = "F" + i;
            String keyPval = "Pval" + i;
            String keyPmin = "Pmin" + i;
            String keyPmax = "Pmax" + i;

            String valueF = data.getOrDefault(keyF, "").toString();
            String valuePval = data.getOrDefault(keyPval, "").toString();
            String valuePmin = data.getOrDefault(keyPmin, "").toString();
            String valuePmax = data.getOrDefault(keyPmax, "").toString();

            String outF    = isPlot ? "Fix" : valueF;
            boolean isFix  = "Fix".equalsIgnoreCase(outF);
            String outPmin = (isPlot || isFix) ? "" : valuePmin;
            String outPmax = (isPlot || isFix) ? "" : valuePmax;
            jsonBuilder.append("\"").append(keyF).append("\": \"").append(outF).append("\",\n");
            jsonBuilder.append("\"").append(keyPval).append("\": \"").append(valuePval).append("\",\n");
            jsonBuilder.append("\"").append(keyPmin).append("\": \"").append(outPmin).append("\",\n");
            jsonBuilder.append("\"").append(keyPmax).append("\": \"").append(outPmax).append("\",\n");
            i++;
        }

        if (isPlot) {
            String dadosPosted = data.getOrDefault("Dados", "").toString();
            String profileName = (String) data.getOrDefault("ProfileName", "");
            int profileIndex = 1;
            Object idxObj = data.get("ProfileIndex");
            if (idxObj != null) {
                try { profileIndex = Integer.parseInt(String.valueOf(idxObj)); } catch (Exception ignore) {}
            }

            if (dadosPosted != null && dadosPosted.contains("<Add input here>")) {
                jsonBuilder.append("\"Dados\": \"# DATA dum = ")
                        .append(profileIndex)
                        .append("\\n# TAG = ")
                        .append((profileName == null || profileName.isEmpty())
                                ? ("Profile " + profileIndex) : profileName)
                        .append("\\n# UNIT = Hz\\n40000000 2.38 0.238\\n30000000 2.39 0.239\\n25000000 2.41 0.241\\n20000000 2.44 0.244\\n15000000 2.51 0.251\\n10000000 2.74 0.274\\n7000000 3.16 0.316\\n5000000 3.73 0.373\\n2500000 4.82 0.482\\n1260000 5.3 0.53\\n632320 5.43 0.543\\n317000 5.47 0.547\\n158800 5.48 0.548\\n112300 5.48 0.548\\n79700 5.48 0.548\\n56200 5.48 0.548\\n39700 5.48 0.548\\n28200 5.48 0.548\\n20000 5.48 0.548\\n14000 5.48 0.548\",\n");
            }

            else {
                StringBuilder formattedDados = new StringBuilder();
                String[] lines = dadosPosted.split("\\n");
                for (String line : lines) {
                    if (line.startsWith("#")) {
                        formattedDados.append(line).append("\\n");
                    } else {
                        String[] parts = line.trim().split("\\s+");
                        if (parts.length >= 3) {
                            try {
                                formattedDados.append(String.format("%s %s %s\\n", parts[0], parts[1], parts[2]));
                            } catch (Exception e) {
                                formattedDados.append(line).append("\\n");
                            }
                        } else {
                            formattedDados.append(line).append("\\n");
                        }
                    }
                }
                jsonBuilder.append("\"Dados\": \"").append(formattedDados.toString()).append("\",\n");
            }
        }
        else {
            String dados = data.getOrDefault("Dados", "").toString();
            StringBuilder formattedDados = new StringBuilder();
            String[] lines = dados.split("\\n");

            for (String line : lines) {
                if (line.startsWith("#")) {
                    formattedDados.append(line).append("\\n");
                } else {
                    String[] parts = line.trim().split("\\s+");
                    if (parts.length >= 3) {
                        try {
                            formattedDados.append(String.format("%s %s %s\\n", parts[0], parts[1], parts[2]));
                        } catch (Exception e) {
                            formattedDados.append(line).append("\\n");
                        }
                    } else {
                        formattedDados.append(line).append("\\n");
                    }
                }
            }
            jsonBuilder.append("\"Dados\": \"").append(formattedDados.toString()).append("\",\n");
        }

        @SuppressWarnings("unchecked")
        List<String> tags = (List<String>) data.getOrDefault("Tags", new ArrayList<>());
        jsonBuilder.append("\"Tags\": [");
        for (int j = 0; j < tags.size(); j++) {
            jsonBuilder.append("\"").append(escapeJsonString(tags.get(j))).append("\"");
            if (j < tags.size() - 1) {
                jsonBuilder.append(", ");
            }
        }
        jsonBuilder.append("],\n");

        String selectedDataSet = escapeJsonString(data.getOrDefault("SelectedDataSet", "").toString());
        jsonBuilder.append("\"SelectedDataSet\": \"").append(selectedDataSet.replace("./", "").replace(".txt", "")).append("\",\n");

        // Function and Parameters
        boolean isModelFreeChecked = Boolean.parseBoolean(data.getOrDefault("ModelFree", "false").toString());
        boolean isOuterSphereChecked = Boolean.parseBoolean(data.getOrDefault("OuterSphere", "false").toString());
        boolean isSecondSphereChecked = Boolean.parseBoolean(data.getOrDefault("SecondSphere", "false").toString());

        if (isSecondSphereChecked) {
            if (isModelFreeChecked && isOuterSphereChecked) {
                jsonBuilder.append("\"Function\": \"R1=R1LipSzab(f, q, C, ms, rho, S, tm, tR, tv, r, Delta2, Aoh, SLS, tl) \\\\+ R1LipSzab(f, q2, C, ms, rho, S, tm2, tR, tv, r2, Delta2, Aoh, SLS, tl) \\\\+ R1OSabh(f, C, S, a, D, tv, Delta2, fn)\",\n");
                jsonBuilder.append("\"Parameters\": \"q,C,ms,rho,S,tm,tR,tv,r,Delta2,Aoh,q2,tm2,r2,SLS,tl,D,a,fn\",\n");
            } else if (isModelFreeChecked) {
                jsonBuilder.append("\"Function\": \"R1=R1LipSzab(f, q, C, ms, rho, S, tm, tR, tv, r, Delta2, Aoh, SLS, tl) \\\\+ R1LipSzab(f, q2, C, ms, rho, S, tm2, tR, tv, r2, Delta2, Aoh, SLS, tl)\",\n");
                jsonBuilder.append("\"Parameters\": \"q,C,ms,rho,S,tm,tR,tv,r,Delta2,Aoh,q2,tm2,r2,SLS,tl\",\n");
            } else if (isOuterSphereChecked) {
                jsonBuilder.append("\"Function\": \"R1=R1ISsbm(f,q,C,ms,p,S,tm,tR,tv,r,Delta2,Aoh) \\\\+ R1ISsbm(f,q2,C,ms,p,S,tm2,tR,tv,r2,Delta2,Aoh) \\\\+ R1OSabh(f, C, S, a, D, tv, Delta2, fn)\",\n");
                jsonBuilder.append("\"Parameters\": \"q,C,ms,p,S,tm,tR,tv,r,Delta2,Aoh,q2,tm2,r2,D,a,fn\",\n");
            } else {
                jsonBuilder.append("\"Function\": \"R1=R1ISsbm(f,q,C,ms,p,S,tm,tR,tv,r,Delta2,Aoh) \\\\+ R1ISsbm(f,q2,C,ms,p,S,tm2,tR,tv,r2,Delta2,Aoh)\",\n");
                jsonBuilder.append("\"Parameters\": \"q,C,ms,p,S,tm,tR,tv,r,Delta2,Aoh,q2,tm2,r2\",\n");
            }
        } else if (isModelFreeChecked && isOuterSphereChecked) {
            jsonBuilder.append("\"Function\": \"R1=R1LipSzab(f, q, C, ms, rho, S, tm, tR, tv, r, Delta2, Aoh, SLS, tl) \\\\+ R1OSabh(f, C, S, a, D, tv, Delta2, fn)\",\n");
            jsonBuilder.append("\"Parameters\": \"q,C,ms,rho,S,tm,tR,tv,r,Delta2,Aoh,SLS,tl,D,a,fn\",\n");
        } else if (isModelFreeChecked) {
            jsonBuilder.append("\"Function\": \"R1=R1LipSzab(f, q, C, ms, rho, S, tm, tR, tv, r, Delta2, Aoh, SLS, tl)\",\n");
            jsonBuilder.append("\"Parameters\": \"q, C, ms, rho, S, tm, tR, tv, r, Delta2, Aoh, SLS, tl\",\n");
        } else if (isOuterSphereChecked) {
            jsonBuilder.append("\"Function\": \"R1ISsbm(f,q,C,ms,p,S,tm,tR,tv,r,Delta2,Aoh) \\\\+ R1OSabh(f, C, S, a, D, tv, Delta2, fn)\",\n");
            jsonBuilder.append("\"Parameters\": \"q,C,ms,p,S,tm,tR,tv,r,Delta2,Aoh,D,a,fn\",\n");
        } else {
            jsonBuilder.append("\"Function\": \"R1ISsbm(f,q,C,ms,p,S,tm,tR,tv,r,Delta2,Aoh)\",\n");
            jsonBuilder.append("\"Parameters\": \"q,C,ms,p,S,tm,tR,tv,r,Delta2,Aoh\",\n");
        }

        // Standard plot config
        jsonBuilder.append("\"FitType\": \"Individual\",\n");
        jsonBuilder.append("\"Func0\": \"\",\n");
        jsonBuilder.append("\"Funcx0\": \"auto\",\n");
        jsonBuilder.append("\"Funcy0\": \"auto\",\n");
        jsonBuilder.append("\"T\": \"N\",\n");
        jsonBuilder.append("\"Traco0\": \"3-dashed\",\n");
        jsonBuilder.append("\"X\": \"f\",\n");
        jsonBuilder.append("\"Xmax\": \"5e8\",\n");
        jsonBuilder.append("\"Xmin\": \"1e4\",\n");
        jsonBuilder.append("\"Y\": \"R1\",\n");
        jsonBuilder.append("\"Ymax\": \"10\",\n");
        jsonBuilder.append("\"Ymin\": \"0\",\n");
        jsonBuilder.append("\"AscaleX\": \"yes\",\n");
        jsonBuilder.append("\"AscaleY\": \"yes\",\n");
        jsonBuilder.append("\"Nome\": \"").append(escapeJsonString(data.getOrDefault("email", "").toString())).append("\"\n");
        jsonBuilder.append("}\n");

        return jsonBuilder.toString();
    }

    @GetMapping("/data_florence")
    @ResponseBody

    private String generateJSON_Florence(Map<String, Object> data) {
        StringBuilder jsonBuilder = new StringBuilder("{\n");

        String mode = (String) data.get("Mode");
        boolean isPlot = "plot".equalsIgnoreCase(mode);

        boolean isModelFreeChecked =
                Boolean.parseBoolean(String.valueOf(data.getOrDefault("ModelFree", "false")));

        boolean isOuterSphereChecked =
                Boolean.parseBoolean(String.valueOf(data.getOrDefault("OuterSphere", "false")));


        String modelFlagValue = String.valueOf(data.getOrDefault("ModelFlag", "1"));
        int flagIndex = isModelFreeChecked ? 25 : 23;

        int fnIndex = flagIndex + 1;

        int uiEndExclusive = isModelFreeChecked ? 25 : 23;

        for (int i = 0; i < uiEndExclusive; i++) {

            String keyF    = "F"    + i;
            String keyPval = "Pval" + i;
            String keyPmin = "Pmin" + i;
            String keyPmax = "Pmax" + i;

            String valueF    = String.valueOf(data.getOrDefault(keyF, "Fix"));
            String valuePval = String.valueOf(data.getOrDefault(keyPval, "0"));
            String valuePmin = String.valueOf(data.getOrDefault(keyPmin, "0"));
            String valuePmax = String.valueOf(data.getOrDefault(keyPmax, "0"));

            String outF    = isPlot ? "Fix" : valueF;
            boolean isFix  = "Fix".equalsIgnoreCase(outF);
            String outPmin = (isPlot || isFix) ? "" : valuePmin;
            String outPmax = (isPlot || isFix) ? "" : valuePmax;

            jsonBuilder.append("\"").append(keyF).append("\": \"").append(outF).append("\",\n");
            jsonBuilder.append("\"").append(keyPval).append("\": \"").append(valuePval).append("\",\n");
            jsonBuilder.append("\"").append(keyPmin).append("\": \"").append(outPmin).append("\",\n");
            jsonBuilder.append("\"").append(keyPmax).append("\": \"").append(outPmax).append("\",\n");
        }

        jsonBuilder.append("\"F").append(flagIndex).append("\": \"Fix\",\n");
        jsonBuilder.append("\"Pval").append(flagIndex).append("\": \"").append(modelFlagValue).append("\",\n");
        jsonBuilder.append("\"Pmin").append(flagIndex).append("\": \"\",\n");
        jsonBuilder.append("\"Pmax").append(flagIndex).append("\": \"\",\n");

        if (isOuterSphereChecked) {
            String fnF    = String.valueOf(data.getOrDefault("F"    + fnIndex, "Fix"));
            String fnPval = String.valueOf(data.getOrDefault("Pval" + fnIndex, "1"));
            String fnPmin = String.valueOf(data.getOrDefault("Pmin" + fnIndex, "0"));
            String fnPmax = String.valueOf(data.getOrDefault("Pmax" + fnIndex, "1"));

            String fnOutF    = isPlot ? "Fix" : fnF;
            boolean fnIsFix  = "Fix".equalsIgnoreCase(fnOutF);
            String fnOutPmin = (isPlot || fnIsFix) ? "" : fnPmin;
            String fnOutPmax = (isPlot || fnIsFix) ? "" : fnPmax;

            jsonBuilder.append("\"F").append(fnIndex).append("\": \"").append(fnOutF).append("\",\n");
            jsonBuilder.append("\"Pval").append(fnIndex).append("\": \"").append(fnPval).append("\",\n");
            jsonBuilder.append("\"Pmin").append(fnIndex).append("\": \"").append(fnOutPmin).append("\",\n");
            jsonBuilder.append("\"Pmax").append(fnIndex).append("\": \"").append(fnOutPmax).append("\",\n");
        }



        if (isPlot) {
            String dadosPosted = data.getOrDefault("Dados", "").toString();
            String profileName = (String) data.getOrDefault("ProfileName", "");
            int profileIndex = 1;
            Object idxObj = data.get("ProfileIndex");
            if (idxObj != null) {
                try { profileIndex = Integer.parseInt(String.valueOf(idxObj)); } catch (Exception ignore) {}
            }

            if (dadosPosted != null && dadosPosted.contains("<Add input here>")) {
                jsonBuilder.append("\"Dados\": \"# DATA P = 298")
                        .append("\\n# TAG = ")
                        .append((profileName == null || profileName.isEmpty())
                                ? ("Profile " + profileIndex) : profileName)
                        .append("\\n# UNIT = Hz\\n11000 6.27E+01 1\\n12000 6.27E+01 1\\n14000 6.27E+01 1\\n16000 6.27E+01 1\\n18000 6.27E+01 1\\n20000 6.26E+01 1\\n22500 6.26E+01 1\\n25000 6.25E+1 1\\n250000 5.5E+1 1\\n2820000 4.80E+01 1\\n3160000 4.76E+01 1\\n3550000 4.69E+01 1\\n3980000 4.56E+01 1\\n4470000 4.35E+01 1\\n5010000 4.10E+01 1\\n5620000 3.86E+01 1\\n6310000 3.68E+01 1\\n7080000 3.58E+01 1\\n8910000 3.57E+01 1\\n10000000 3.63E+01 1\\n11200000 3.75E+01 1\\n12600000 3.91E+01 1\\n14100000 4.11E+01 1\\n15900000 4.36E+01 1\\n17800000 4.66E+01 1\\n20000000 4.99E+01 1\\n25100000 5.67E+01 1\\n28200000 5.97E+01 1\\n31600000 6.16E+01 1\\n35500000 6.19E+01 1\\n39800000 6.01E+01 1\\n44700000 5.62E+01 1\\n50100000 5.04E+01 1\\n56200000 4.35E+01 1\\n200000000 3.56E+00 1\\n224000000 2.81E+00 1\\n251000000 2.22E+00 1\\n282000000 1.76E+00 1\\n316000000 1.39E+00 1\\n355000000 1.10E+00 1\\n398000000 8.73E-01 1\\n447000000 6.92E-01 1\\n501000000 5.49E-01 1\\n562000000 4.35E-01 1\\n631000000 3.45E-01 1\\n708000000 2.74E-01 1\\n794000000 2.18E-01 1\\n891000000 1.73E-01 1\\n1000000000 1.37E-01 1\\n\",\n");
            }

            else {
                StringBuilder formattedDados = new StringBuilder();
                String[] lines = dadosPosted.split("\\n");
                for (String line : lines) {
                    if (line.startsWith("#")) {
                        formattedDados.append(line).append("\\n");
                    } else {
                        String[] parts = line.trim().split("\\s+");
                        if (parts.length >= 3) {
                            try {
                                formattedDados.append(String.format("%s %s %s\\n", parts[0], parts[1], parts[2]));
                            } catch (Exception e) {
                                formattedDados.append(line).append("\\n");
                            }
                        } else {
                            formattedDados.append(line).append("\\n");
                        }
                    }
                }
                jsonBuilder.append("\"Dados\": \"").append(formattedDados.toString()).append("\",\n");
            }
        }
        else {
            String dados = data.getOrDefault("Dados", "").toString();
            StringBuilder formattedDados = new StringBuilder();
            String[] lines = dados.split("\\n");

            for (String line : lines) {
                if (line.startsWith("#")) {
                    formattedDados.append(line).append("\\n");
                } else {
                    String[] parts = line.trim().split("\\s+");
                    if (parts.length >= 3) {
                        try {
                            formattedDados.append(String.format("%s %s %s\\n", parts[0], parts[1], parts[2]));
                        } catch (Exception e) {
                            formattedDados.append(line).append("\\n");
                        }
                    } else {
                        formattedDados.append(line).append("\\n");
                    }
                }
            }
            jsonBuilder.append("\"Dados\": \"").append(formattedDados.toString()).append("\",\n");
        }

        // Add Tags
        @SuppressWarnings("unchecked")
        List<String> tags = (List<String>) data.getOrDefault("Tags", new ArrayList<>());
        jsonBuilder.append("\"Tags\": [");
        for (int j = 0; j < tags.size(); j++) {
            jsonBuilder.append("\"").append(escapeJsonString(tags.get(j))).append("\"");
            if (j < tags.size() - 1) {
                jsonBuilder.append(", ");
            }
        }
        jsonBuilder.append("],\n");

        // SelectedDataSet
        String selectedDataSet = escapeJsonString(data.getOrDefault("SelectedDataSet", "").toString());
        jsonBuilder.append("\"SelectedDataSet\": \"").append(selectedDataSet.replace("./", "").replace(".txt", "")).append("\",\n");

        if (isModelFreeChecked && isOuterSphereChecked) {
            jsonBuilder.append("\"Function\": \"SLS*FlorenceN(1.0,3.0,f, SI, GAMMAI, SPIN, 1.0, DELTA2, TAURM, TAUVM, TAUMM, DPARAM, EPARAM, 0.0, GXM, GYM, GZM, AXM, AYM, AZM, 0.0, 0.0, CONCM, 1.0, AMOLFRAM, RKM, ACONTM, THETAM, PHIM, FLAG) + (1-SLS)*FlorenceN4LS(1.0,3.0,f, SI, GAMMAI, SPIN, 1.0, DELTA2, TAULM, TAUVM, TAUMM, DPARAM, EPARAM, 0.0, GXM, GYM, GZM, AXM, AYM, AZM, 0.0, 0.0, CONCM, 1.0, AMOLFRAM, RKM, ACONTM, THETAM, PHIM, FLAG) \\\\+ SLS*FlorenceN(2.0,3.0,f, SI, GAMMAI, SPIN, 1.0, DELTA2, TAURM, TAUVM, TAUMM, DPARAM, EPARAM, 0.0, GXM, GYM, GZM, AXM, AYM, AZM, 0.0, 0.0, CONCM, 1.0, AMOLFRAM, RKM, ACONTM, THETAM, PHIM, FLAG) + (1-SLS)*FlorenceN4LS(2.0,3.0,f, SI, GAMMAI, SPIN, 1.0, DELTA2, TAULM, TAUVM, TAUMM, DPARAM, EPARAM, 0.0, GXM, GYM, GZM, AXM, AYM, AZM, 0.0, 0.0, CONCM, 1.0, AMOLFRAM, RKM, ACONTM, THETAM, PHIM, FLAG) \\\\+ SLS*FlorenceN(3.0,3.0,f, SI, GAMMAI, SPIN, 1.0, DELTA2, TAURM, TAUVM, TAUMM, DPARAM, EPARAM, 0.0, GXM, GYM, GZM, AXM, AYM, AZM, 0.0, 0.0, CONCM, 1.0, AMOLFRAM, RKM, ACONTM, THETAM, PHIM, FLAG) + (1-SLS)*FlorenceN4LS(3.0,3.0,f, SI, GAMMAI, SPIN, 1.0, DELTA2, TAULM, TAUVM, TAUMM, DPARAM, EPARAM, 0.0, GXM, GYM, GZM, AXM, AYM, AZM, 0.0, 0.0, CONCM, 1.0, AMOLFRAM, RKM, ACONTM, THETAM, PHIM, FLAG) \\\\+ R1OSabh(f, CONCM*1e3, SPIN, DM, DDM, TAUVM, pow(1.883636123e11*DELTA2, 2.0),FN)\",\n");
            jsonBuilder.append("\"Parameters\": \"SI,GAMMAI,SPIN,DELTA2,TAURM,TAUVM,TAUMM,DPARAM,EPARAM,GXM,GYM,GZM,AXM,AYM,AZM,CONCM,RKM,DM,DDM,ACONTM,AMOLFRAM,THETAM,PHIM,SLS,TAULM,FLAG,FN\",\n");

        } else if (isModelFreeChecked) {
            // ---- CASE: Model-Free only ----
            jsonBuilder.append("\"Function\": \"SLS*FlorenceN(1.0,4.0,f, SI, GAMMAI, SPIN, 1.0, DELTA2, TAURM, TAUVM, TAUMM, DPARAM, EPARAM, 0.0, GXM, GYM, GZM, AXM, AYM, AZM, DM, DDM, CONCM, 1.0, AMOLFRAM, RKM, ACONTM, THETAM, PHIM, FLAG) + (1-SLS)*FlorenceN4LS(1.0,4.0,f, SI, GAMMAI, SPIN, 1.0, DELTA2, TAULM, TAUVM, TAUMM, DPARAM, EPARAM, 0.0, GXM, GYM, GZM, AXM, AYM, AZM, DM, DDM, CONCM, 1.0, AMOLFRAM, RKM, ACONTM, THETAM, PHIM, FLAG) \\\\+ SLS*FlorenceN(2.0,4.0,f, SI, GAMMAI, SPIN, 1.0, DELTA2, TAURM, TAUVM, TAUMM, DPARAM, EPARAM, 0.0, GXM, GYM, GZM, AXM, AYM, AZM, DM, DDM, CONCM, 1.0, AMOLFRAM, RKM, ACONTM, THETAM, PHIM, FLAG) + (1-SLS)*FlorenceN4LS(2.0,4.0,f, SI, GAMMAI, SPIN, 1.0, DELTA2, TAULM, TAUVM, TAUMM, DPARAM, EPARAM, 0.0, GXM, GYM, GZM, AXM, AYM, AZM, DM, DDM, CONCM, 1.0, AMOLFRAM, RKM, ACONTM, THETAM, PHIM, FLAG) \\\\+ SLS*FlorenceN(3.0,4.0,f, SI, GAMMAI, SPIN, 1.0, DELTA2, TAURM, TAUVM, TAUMM, DPARAM, EPARAM, 0.0, GXM, GYM, GZM, AXM, AYM, AZM, DM, DDM, CONCM, 1.0, AMOLFRAM, RKM, ACONTM, THETAM, PHIM, FLAG) + (1-SLS)*FlorenceN4LS(3.0,4.0,f, SI, GAMMAI, SPIN, 1.0, DELTA2, TAULM, TAUVM, TAUMM, DPARAM, EPARAM, 0.0, GXM, GYM, GZM, AXM, AYM, AZM, DM, DDM, CONCM, 1.0, AMOLFRAM, RKM, ACONTM, THETAM, PHIM, FLAG) \\\\+ SLS*FlorenceN(4.0,4.0,f, SI, GAMMAI, SPIN, 1.0, DELTA2, TAURM, TAUVM, TAUMM, DPARAM, EPARAM, 0.0, GXM, GYM, GZM, AXM, AYM, AZM, DM, DDM, CONCM, 1.0, AMOLFRAM, RKM, ACONTM, THETAM, PHIM, FLAG) + (1-SLS)*FlorenceN4LS(4.0,4.0,f, SI, GAMMAI, SPIN, 1.0, DELTA2, TAULM, TAUVM, TAUMM, DPARAM, EPARAM, 0.0, GXM, GYM, GZM, AXM, AYM, AZM, DM, DDM, CONCM, 1.0, AMOLFRAM, RKM, ACONTM, THETAM, PHIM, FLAG)\",\n");
            jsonBuilder.append("\"Parameters\": \"SI,GAMMAI,SPIN,DELTA2,TAURM,TAUVM,TAUMM,DPARAM,EPARAM,GXM,GYM,GZM,AXM,AYM,AZM,CONCM,RKM,DM,DDM,ACONTM,AMOLFRAM,THETAM,PHIM,SLS,TAULM,FLAG\",\n");


        } else if (isOuterSphereChecked) {
            // ---- CASE: Outer-Sphere only ----
            jsonBuilder.append("\"Function\": \"FlorenceN(1.0,3.0,f, SI, GAMMAI, SPIN, 1.0, DELTA2, TAURM, TAUVM, TAUMM, DPARAM, EPARAM, 0.0, GXM, GYM, GZM, AXM, AYM, AZM, 0.0, 0.0, CONCM, 1.0, AMOLFRAM, RKM, ACONTM, THETAM, PHIM, FLAG) \\\\+ FlorenceN(2.0,3.0,f, SI, GAMMAI, SPIN, 1.0, DELTA2, TAURM, TAUVM, TAUMM, DPARAM, EPARAM, 0.0, GXM, GYM, GZM, AXM, AYM, AZM, 0.0, 0.0, CONCM, 1.0, AMOLFRAM, RKM, ACONTM, THETAM, PHIM, FLAG) \\\\+ FlorenceN(3.0,3.0,f, SI, GAMMAI, SPIN, 1.0, DELTA2, TAURM, TAUVM, TAUMM, DPARAM, EPARAM, 0.0, GXM, GYM, GZM, AXM, AYM, AZM, 0.0, 0.0, CONCM, 1.0, AMOLFRAM, RKM, ACONTM, THETAM, PHIM, FLAG) \\\\+ R1OSabh(f, CONCM*1e3, SPIN, DM, DDM, TAUVM, pow(1.883636123e11*DELTA2, 2.0),FN)\",\n");
            jsonBuilder.append("\"Parameters\": \"SI,GAMMAI,SPIN,DELTA2,TAURM,TAUVM,TAUMM,DPARAM,EPARAM,GXM,GYM,GZM,AXM,AYM,AZM,CONCM,RKM,DM,DDM,ACONTM,AMOLFRAM,THETAM,PHIM,FLAG,FN\",\n");

        } else {
            // ---- CASE: no Model-Free, no Outer-Sphere ----
            jsonBuilder.append("\"Function\": \"FlorenceN(1.0,4.0,f, SI, GAMMAI, SPIN, 1.0, DELTA2, TAURM, TAUVM, TAUMM, DPARAM, EPARAM, 0.0, GXM, GYM, GZM, AXM, AYM, AZM, DM, DDM, CONCM, 1.0, AMOLFRAM, RKM, ACONTM, THETAM, PHIM, FLAG) \\\\+ FlorenceN(2.0,4.0,f, SI, GAMMAI, SPIN, 1.0, DELTA2, TAURM, TAUVM, TAUMM, DPARAM, EPARAM, 0.0, GXM, GYM, GZM, AXM, AYM, AZM, DM, DDM, CONCM, 1.0, AMOLFRAM, RKM, ACONTM, THETAM, PHIM, FLAG) \\\\+ FlorenceN(3.0,4.0,f, SI, GAMMAI, SPIN, 1.0, DELTA2, TAURM, TAUVM, TAUMM, DPARAM, EPARAM, 0.0, GXM, GYM, GZM, AXM, AYM, AZM, DM, DDM, CONCM, 1.0, AMOLFRAM, RKM, ACONTM, THETAM, PHIM, FLAG) \\\\+ FlorenceN(4.0,4.0,f, SI, GAMMAI, SPIN, 1.0, DELTA2, TAURM, TAUVM, TAUMM, DPARAM, EPARAM, 0.0, GXM, GYM, GZM, AXM, AYM, AZM, DM, DDM, CONCM, 1.0, AMOLFRAM, RKM, ACONTM, THETAM, PHIM, FLAG)\",\n");
            jsonBuilder.append("\"Parameters\": \"SI,GAMMAI,SPIN,DELTA2,TAURM,TAUVM,TAUMM,DPARAM,EPARAM,GXM,GYM,GZM,AXM,AYM,AZM,CONCM,RKM,DM,DDM,ACONTM,AMOLFRAM,THETAM,PHIM,FLAG\",\n");

        }

        // Standard plot config
        jsonBuilder.append("\"FitType\": \"Individual\",\n");
        jsonBuilder.append("\"FitMethods\": \"scan simp migrad\",\n");
        jsonBuilder.append("\"Func0\": \"\",\n");
        jsonBuilder.append("\"Func1\": \"\",\n");
        jsonBuilder.append("\"Func2\": \"\",\n");
        jsonBuilder.append("\"Func3\": \"\",\n");
        jsonBuilder.append("\"Funcx0\": \"auto\",\n");
        jsonBuilder.append("\"Funcx1\": \"auto\",\n");
        jsonBuilder.append("\"Funcx2\": \"auto\",\n");
        jsonBuilder.append("\"Funcx3\": \"auto\",\n");
        jsonBuilder.append("\"Funcy0\": \"auto\",\n");
        jsonBuilder.append("\"Funcy1\": \"auto\",\n");
        jsonBuilder.append("\"Funcy2\": \"auto\",\n");
        jsonBuilder.append("\"Funcy3\": \"auto\",\n");
        jsonBuilder.append("\"T\": \"P\",\n");
        jsonBuilder.append("\"Num\": 100,\n");
        jsonBuilder.append("\"Traco0\": \"3-dashed\",\n");
        jsonBuilder.append("\"Traco1\": \"4-long dashes\",\n");
        jsonBuilder.append("\"Traco2\": \"5-dot dashed\",\n");
        jsonBuilder.append("\"Traco3\": \"6-dot long dashes\",\n");
        jsonBuilder.append("\"X\": \"f\",\n");
        jsonBuilder.append("\"Xmax\": \"5e8\",\n");
        jsonBuilder.append("\"Xmin\": \"1e4\",\n");
        jsonBuilder.append("\"Y\": \"R1\",\n");
        jsonBuilder.append("\"Ymax\": \"100\",\n");
        jsonBuilder.append("\"Ymin\": \"0\",\n");
        jsonBuilder.append("\"AscaleX\": \"yes\",\n");
        jsonBuilder.append("\"AscaleY\": \"yes\",\n");
        jsonBuilder.append("\"Nome\": \"").append(escapeJsonString(data.getOrDefault("email", "").toString())).append("\"\n");
        jsonBuilder.append("}\n");

        return jsonBuilder.toString();
    }

    private static String[] splitTrim(String s) {
        String[] a = s.split(",");
        for (int i = 0; i < a.length; i++) a[i] = a[i].trim();
        return a;
    }

    @GetMapping("/data_corr")
    @ResponseBody
    private String generateJSON_corr(Map<String, Object> data) {
        StringBuilder jsonBuilder = new StringBuilder("{\n");

        int k = 0;
        while (data.containsKey("F"+k) || data.containsKey("Pval"+k) || data.containsKey("Pmin"+k) || data.containsKey("Pmax"+k)) {
            String fValK    = String.valueOf(data.getOrDefault("F"+k, ""));
            boolean isFixK  = "Fix".equalsIgnoreCase(fValK);
            jsonBuilder.append("\"F").append(k).append("\": \"").append(fValK).append("\",\n");
            jsonBuilder.append("\"Pval").append(k).append("\": \"").append(String.valueOf(data.getOrDefault("Pval"+k, ""))).append("\",\n");
            jsonBuilder.append("\"Pmin").append(k).append("\": \"").append(isFixK ? "" : String.valueOf(data.getOrDefault("Pmin"+k, ""))).append("\",\n");
            jsonBuilder.append("\"Pmax").append(k).append("\": \"").append(isFixK ? "" : String.valueOf(data.getOrDefault("Pmax"+k, ""))).append("\",\n");
            k++;
        }
        jsonBuilder.append("\"Traco0\": \"3-dashed\",\n");
        jsonBuilder.append("\"X\": \"f\",\n");
        jsonBuilder.append("\"Xmax\": \"1e+08\",\n");
        jsonBuilder.append("\"Xmin\": \"6000\",\n");
        jsonBuilder.append("\"Y\": \"R1\",\n");
        jsonBuilder.append("\"Ymax\": \"50\",\n");
        jsonBuilder.append("\"Ymin\": \"0\",\n");
        jsonBuilder.append("\"FitType\": \"Individual\",\n");
        jsonBuilder.append("\"Func0\": \"\",\n");
        jsonBuilder.append("\"AscaleX\": \"yes\",\n");
        jsonBuilder.append("\"AscaleY\": \"yes\",\n");
        jsonBuilder.append("\"Cor0\": \"2-red\",\n");
        jsonBuilder.append("\"FitMethods\": \"simp scan min minos\",\n");
        jsonBuilder.append("\"Funcx0\": \"auto\",\n");
        jsonBuilder.append("\"Funcy0\": \"auto\",\n");
        jsonBuilder.append("\"T\": \"N\",\n");

        boolean isModelFreeChecked = Boolean.parseBoolean(String.valueOf(data.getOrDefault("ModelFree", "false")));
        boolean isOuterSphereChecked = Boolean.parseBoolean(String.valueOf(data.getOrDefault("OuterSphere", "false")));

        if (isModelFreeChecked && isOuterSphereChecked) {
            String parametersString = (String) data.get("ParametersString");
            if (parametersString == null || parametersString.isEmpty()) {
                parametersString = "q, C, ms, rho, S, tm, tR, tv, r, Delta2, Aoh, SLS, tl, D, a, fn";
            }
            String dmode = String.valueOf(data.getOrDefault("Dmode", "A"));  // A = general, B = discrete

            if (dmode.equals("B")) {
                jsonBuilder.append("\"Function\": \"R1=R1LipSzab_hybrid(f, N, par) \\\\+ R1OSabh_hybrid_D(f, N, par)\",\n");
            } else {
                String[] p = splitTrim(parametersString);
                jsonBuilder.append(String.format(
                        "\"Function\": \"R1=R1LipSzab(f, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s) \\\\+ R1OSabh(f, %s, %s, %s, %s, %s, %s, %s)\",\n",
                        p[0], p[1], p[2], p[3], p[4], p[5], p[6], p[7], p[8], p[9], p[10], p[11], p[12],
                        p[1], p[4], p[14], p[13], p[7], p[9], p[15]
                ));
            }

            jsonBuilder.append("\"Parameters\": \"").append(parametersString).append("\",\n");

            if (dmode.equals("B")) {
                jsonBuilder.append("\"AuxCode\": \"#include <stdio.h>\\r\\n#include <math.h>\\r\\n#include <stdlib.h>\\r\\n#include <string.h>\\r\\n#include \\\"globals.h\\\"\\r\\n#include \\\"struct.h\\\"\\r\\n#include \\\"userlib.h\\\"\\r\\n#include \\\"ndata.h\\\"\\r\\n#include \\\"mixed.h\\\"\\r\\n\\r\\n#define pi 3.1415926\\r\\n\\r\\n#define gammae 1.76085963023e11\\r\\n#define gamma 2.6752212881e8\\r\\n\\r\\n\\r\\ndouble R1LipSzab_hybrid(double f, double N, double *par);\\r\\ndouble R1LipSzab_hybrid(double f, double N, double *par)\\r\\n{\\r\\n double q, C, ms, rho, S, tm, tR, tv, r, Delta2, Aoh, SLS, tl, af;\\r\\n\\r\\n      q        = par[1];\\r\\n      C        = par[2];\\r\\n      ms      = par[3];\\r\\n      rho      = par[4];\\r\\n      S         = par[5];\\r\\n      tm       = par[6];\\r\\n      tR        = par[7];\\r\\n      tv         = par[8];\\r\\n      r           = par[9];\\r\\n      Delta2 = par[10];\\r\\n      Aoh     = par[11];\\r\\n      SLS     = par[12];\\r\\n      tl         = par[13];\\r\\n\\r\\n      af=R1LipSzab(f, q, C, ms, rho, S, tm, tR, tv, r, Delta2, Aoh, SLS, tl);\\r\\n \\r\\n  return af;\\r\\n}\\r\\n\\r\\ndouble R1OSabh_hybrid_D(double f, double N, double *par);\\r\\ndouble R1OSabh_hybrid_D(double f, double N, double *par)\\r\\n{\\r\\n double C, S, a, D, tv, Delta2, fn, af;\\r\\n \\r\\n\\r\\n C = par[2];\\r\\n S = par[5];\\r\\n a = par[14];\\r\\n D = N_3;\\r\\n tv = par[8];\\r\\n Delta2 = par[10];\\r\\nDelta2 = par[15];\\r\\n \\r\\n\\r\\naf=R1OSabh(f, C, S, a, D, tv, Delta2, fn);\\r\\n \\r\\n return af;\\r\\n}\",\n");
                jsonBuilder.append("\"AuxDeclar\": \"double R1LipSzab_hybrid(), R1OSabh_hybrid_D()\",\n");
            }


        } else if (isModelFreeChecked) {
            String parametersString = (String) data.get("ParametersString");
            if (parametersString == null || parametersString.isEmpty()) {
                parametersString = "q, C, ms, rho, S, tm, tR, tv, r, Delta2, Aoh, SLS, tl";
            }
            jsonBuilder.append("\"Function\": \"R1=R1LipSzab(f, ").append(String.join(", ", splitTrim(parametersString))).append(")\",\n");
            jsonBuilder.append("\"Parameters\": \"").append(parametersString).append("\",\n");

        } else if (isOuterSphereChecked) {
            String parametersString = (String) data.get("ParametersString");
            if (parametersString == null || parametersString.isEmpty()) {
                parametersString = "q, C, ms, rho, S, tm, tR, tv, r, Delta2, Aoh, D, a, fn";
            }
            String dmode = String.valueOf(data.getOrDefault("Dmode", "A"));

            if (dmode.equals("B")) {
                jsonBuilder.append("\"Function\": \"R1=R1ISsbm_hybrid(f, N, par) \\\\+ R1OSabh_hybrid_D(f, N, par)\",\n");
            } else {
                String[] p = splitTrim(parametersString);
                jsonBuilder.append(String.format(
                        "\"Function\": \"R1=R1ISsbm(f,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) \\\\+ R1OSabh(f, %s, %s, %s, %s, %s, %s, %s)\",\n",
                        p[0], p[1], p[2], p[3], p[4], p[5], p[6], p[7], p[8], p[9], p[10],
                        p[1], p[4], p[12], p[11], p[7], p[9], p[13]
                ));
            }

            jsonBuilder.append("\"Parameters\": \"").append(parametersString).append("\",\n");

            if (dmode.equals("B")) {
                jsonBuilder.append("\"AuxCode\": \"#include <stdio.h>\\r\\n#include <math.h>\\r\\n#include <stdlib.h>\\r\\n#include <string.h>\\r\\n#include \\\"globals.h\\\"\\r\\n#include \\\"struct.h\\\"\\r\\n#include \\\"userlib.h\\\"\\r\\n#include \\\"ndata.h\\\"\\r\\n#include \\\"mixed.h\\\"\\r\\n\\r\\n#define pi 3.1415926\\r\\n\\r\\n#define gammae 1.76085963023e11\\r\\n#define gamma 2.6752212881e8\\r\\n\\r\\n\\r\\ndouble R1ISsbm_hybrid(double f, double N, double *par);\\r\\ndouble R1OSabh_hybrid_D(double f, double N, double *par);\\r\\n\\r\\n\\r\\ndouble R1ISsbm_hybrid(double f, double N, double *par)\\r\\n{\\r\\n double q, C, ms, rho, S, tm, tR, tv, r, Delta2, Aoh, af;\\r\\n\\r\\n q = par[1];\\r\\n C = par[2];\\r\\n ms = par[3];\\r\\n rho = par[4];\\r\\n S = par[5];\\r\\n tm = par[6];\\r\\n tR = par[7];\\r\\n tv = par[8];\\r\\n r = par[9];\\r\\n Delta2 = par[10];\\r\\n Aoh = par[11];\\r\\n\\r\\naf=R1ISsbm(f, q, C, ms, rho, S, tm, tR, tv, r, Delta2, Aoh);\\r\\n \\r\\n  return af;\\r\\n}\\r\\n\\r\\ndouble R1OSabh_hybrid_D(double f, double N, double *par)\\r\\n{\\r\\n double C, S, a, D, tv, Delta2, fn, af;\\r\\n \\r\\n C = par[2];\\r\\n S = par[5];\\r\\n a = par[12];\\r\\n D = N_3;\\r\\n tv = par[8];\\r\\n Delta2 = par[10];\\r\\n fn = par[13];\\r\\n\\r\\naf=R1OSabh(f, C, S, a, D, tv, Delta2, fn);\\r\\n \\r\\n return af;\\r\\n}\",\n");
                jsonBuilder.append("\"AuxDeclar\": \"double R1ISsbm_hybrid(), R1OSabh_hybrid_D()\",\n");
            }

        } else {
            String parametersString = (String) data.get("ParametersString");
            if (parametersString == null || parametersString.isEmpty()) {
                parametersString = "q, C, ms, rho, S, tm, tR, tv, r, Delta2, Aoh";
            }
            jsonBuilder.append("\"Function\": \"R1=R1ISbm(f, ").append(String.join(", ", splitTrim(parametersString))).append(")\",\n");
            jsonBuilder.append("\"Parameters\": \"").append(parametersString).append("\",\n");
        }
        String dados = data.get("dados") != null ? data.get("dados").toString()
                : (data.get("Dados") != null ? data.get("Dados").toString() : "");

        dados = dados.replace("\r\n", "\n").replace("\r", "\n");

        jsonBuilder.append("\"Dados\": \"")
                .append(dados
                        .replace("\\", "\\\\")
                        .replace("\"", "\\\"")
                        .replace("\n", "\\n"))
                .append("\",\n");

        List<String> tabs = new ArrayList<>();
        Object maybeArray = data.get("AllTabs");
        if (maybeArray instanceof List) {
            for (Object o : (List<?>) maybeArray) {
                if (o != null) tabs.add(String.valueOf(o));
            }
        }


        jsonBuilder.append("\"Tags\": [\n");
        for (int i = 0; i < tabs.size(); i++) {
            jsonBuilder.append("  \"")
                    .append(tabs.get(i).replace("\\", "\\\\").replace("\"", "\\\""))
                    .append("\"");
            if (i < tabs.size() - 1) jsonBuilder.append(",");
            jsonBuilder.append("\n");
        }
        jsonBuilder.append("],\n");

        String active = String.valueOf(data.getOrDefault("ActiveTab", ""));
        jsonBuilder.append("\"SelectedDataSet\": \"")
                .append(active.replace("\\", "\\\\").replace("\"", "\\\""))
                .append("\"\n");


        jsonBuilder.append("}\n");
        return jsonBuilder.toString();
    }

    private String escapeJsonString(String value) {
        return value.replace("\"", "\\\"");
    }

    @GetMapping("/data_svante")
    @ResponseBody
    private String generateJSON_svante(Map<String, Object> data) {
        StringBuilder jsonBuilder = new StringBuilder("{\n");

        Set<Integer> sharedFixIndices = new HashSet<>();
        String parametersStr = String.valueOf(data.getOrDefault("ParametersString", ""));
        if (!parametersStr.isEmpty()) {
            String[] paramLabels = parametersStr.split(",");
            for (int pi = 0; pi < paramLabels.length; pi++) {
                if (paramLabels[pi].trim().endsWith("_")) {
                    sharedFixIndices.add(pi);
                }
            }
        }

        int k = 0;
        while (data.containsKey("F"+k) || data.containsKey("Pval"+k) || data.containsKey("Pmin"+k) || data.containsKey("Pmax"+k)) {
            String fValK    = String.valueOf(data.getOrDefault("F"+k, ""));
            boolean isFixK  = "Fix".equalsIgnoreCase(fValK);
            boolean isSharedFix = sharedFixIndices.contains(k);
            boolean suppressBounds = isFixK && !isSharedFix;
            jsonBuilder.append("\"F").append(k).append("\": \"").append(fValK).append("\",\n");
            jsonBuilder.append("\"Pval").append(k).append("\": \"").append(String.valueOf(data.getOrDefault("Pval"+k, ""))).append("\",\n");
            jsonBuilder.append("\"Pmin").append(k).append("\": \"").append(suppressBounds ? "" : String.valueOf(data.getOrDefault("Pmin"+k, ""))).append("\",\n");
            jsonBuilder.append("\"Pmax").append(k).append("\": \"").append(suppressBounds ? "" : String.valueOf(data.getOrDefault("Pmax"+k, ""))).append("\",\n");
            k++;
        }
        jsonBuilder.append("\"Traco0\": \"3-dashed\",\n");
        jsonBuilder.append("\"X\": \"f\",\n");
        jsonBuilder.append("\"Xmax\": \"1e+08\",\n");
        jsonBuilder.append("\"Xmin\": \"6000\",\n");
        jsonBuilder.append("\"Y\": \"R1\",\n");
        jsonBuilder.append("\"Ymax\": \"50\",\n");
        jsonBuilder.append("\"Ymin\": \"0\",\n");
        jsonBuilder.append("\"FitType\": \"Individual\",\n");
        jsonBuilder.append("\"Func0\": \"\",\n");
        jsonBuilder.append("\"AscaleX\": \"yes\",\n");
        jsonBuilder.append("\"AscaleY\": \"yes\",\n");
        jsonBuilder.append("\"Cor0\": \"2-red\",\n");
        jsonBuilder.append("\"FitMethods\": \"simp scan min minos\",\n");
        jsonBuilder.append("\"Funcx0\": \"auto\",\n");
        jsonBuilder.append("\"Funcy0\": \"auto\",\n");
        jsonBuilder.append("\"T\": \"N\",\n");

        boolean isModelFreeChecked = Boolean.parseBoolean(String.valueOf(data.getOrDefault("ModelFree", "false")));
        boolean isOuterSphereChecked = Boolean.parseBoolean(String.valueOf(data.getOrDefault("OuterSphere", "false")));

        if (isModelFreeChecked && isOuterSphereChecked) {
            jsonBuilder.append("\"Parameters\": \"").append(String.valueOf(data.getOrDefault("ParametersString", ""))).append("\",\n");

            String dmode = String.valueOf(data.getOrDefault("Dmode_svante", "X"));  // A = general, B = discrete
            if (dmode.equals("Y")) {
                // D-discrete
                jsonBuilder.append("\"Function\": \"R1=R1LipSzab_fHD(f, N, par) + R1OSabh_fHD(f, N, par)\",\n");
                jsonBuilder.append("\"AuxCode\": \"#include <stdio.h>\\r\\n#include <math.h>\\r\\n#include <stdlib.h>\\r\\n#include <string.h>\\r\\n#include \\\"globals.h\\\"\\r\\n#include \\\"struct.h\\\"\\r\\n#include \\\"userlib.h\\\"\\r\\n#include \\\"ndata.h\\\"\\r\\n#include \\\"mixed.h\\\"\\r\\n\\r\\n#define pi 3.1415926\\r\\n\\r\\ndouble R1LipSzab_fHD(double f, double N, double *par);\\r\\ndouble R1LipSzab_fHD(double f, double N, double *par)\\r\\n{\\r\\n double q, C, ms, rho,  S, tmref, trref, tvref, Em, Er, Ev, r, Delta2, Aoh, SLS, tlref, El, Tref;\\r\\n\\r\\n q = par[1];\\r\\n C = par[2];\\r\\n ms = par[3];\\r\\n rho = par[4];\\r\\n S = par[5];\\r\\n tmref = par[6];\\r\\n trref = par[7];\\r\\n tvref = par[8];\\r\\n Em = par[9];\\r\\n Er = par[10];\\r\\n Ev = par[11];\\r\\n r = par[12];\\r\\n Delta2 = par[13];\\r\\n Aoh = par[14];\\r\\n SLS = par[15];\\r\\n tlref = par[16];\\r\\n El = par[17];\\r\\n Tref = par[20];\\r\\n\\r\\n double tm, tR, tv, tl, af; \\r\\n\\r\\n  tR = trref*exp(Er*(1.0/N_1-1.0/Tref));\\r\\n\\r\\n  tm = tmref*exp(Em*(1.0/N_1-1.0/Tref));\\r\\n\\r\\n  tv = tvref*exp(Ev*(1.0/N_1-1.0/Tref));\\r\\n  \\r\\n  tl = tlref*exp(El*(1.0/N_1-1.0/Tref));\\r\\n\\r\\n  af = R1LipSzab(f, q, C, ms, rho, S, tm, tR, tv, r, Delta2, Aoh, SLS, tl);  \\r\\n\\r\\n  return af;\\r\\n}\\r\\n\\r\\ndouble R1OSabh_fHD(double f, double N, double *par);\\r\\n\\r\\ndouble R1OSabh_fHD(double f, double N, double *par)\\r\\n{\\r\\n double C, S, a, D, tvref, Ev, Delta2, Tref, fn;\\r\\n \\r\\n C = par[2];\\r\\n S = par[5];\\r\\n a = par[18];\\r\\n D = N_3;\\r\\n tvref = par[8];\\r\\n Ev = par[11];\\r\\n Delta2 = par[13];\\r\\n fn = par[19];\\r\\n Tref = par[20];\\r\\n\\r\\n\\r\\ndouble tv, af; \\r\\n\\r\\ntv = tvref*exp(Ev*(1.0/N_1-1.0/Tref));\\r\\n\\r\\naf=R1OSabh(f, C, S, a, D, tv, Delta2, fn);\\r\\n \\r\\n return af;\\r\\n}\\r\\n\\r\\n\",\n");
                jsonBuilder.append("\"AuxDeclar\": \"double R1LipSzab_fHD(), R1OSabh_fHD()\",\n");
            } else {
                // D-general
                jsonBuilder.append("\"Function\": \"R1=R1LipSzab_fH(f, N, par) + R1OSabh_fH(f, N, par)\",\n");
                jsonBuilder.append("\"AuxCode\": \"#include <stdio.h>\\r\\n#include <math.h>\\r\\n#include <stdlib.h>\\r\\n#include <string.h>\\r\\n#include \\\"globals.h\\\"\\r\\n#include \\\"struct.h\\\"\\r\\n#include \\\"userlib.h\\\"\\r\\n#include \\\"ndata.h\\\"\\r\\n#include \\\"mixed.h\\\"\\r\\n\\r\\n#define pi 3.1415926\\r\\n\\r\\ndouble R1LipSzab_fH(double f, double N, double *par);\\r\\n\\r\\ndouble R1LipSzab_fH(double f, double N, double *par)\\r\\n{\\r\\n double q, C, ms, rho,  S, tmref, trref, tvref, Em, Er, Ev, r, Delta2, Aoh, SLS, tlref, El, Tref;\\r\\n\\r\\n\\r\\n q = par[1];\\r\\n C = par[2];\\r\\n ms = par[3];\\r\\n rho = par[4];\\r\\n S = par[5];\\r\\n tmref = par[6];\\r\\n trref = par[7];\\r\\n tvref = par[8];\\r\\n Em = par[9];\\r\\n Er = par[10];\\r\\n Ev = par[11];\\r\\n r = par[12];\\r\\n Delta2 = par[13];\\r\\n Aoh = par[14];\\r\\n SLS = par[15];\\r\\n tlref = par[16];\\r\\n El = par[17];\\r\\n Tref = par[21];\\r\\n\\r\\n double tm, tR, tv, tl, af; \\r\\n\\r\\n  tR = trref*exp(Er*(1.0/N_1-1.0/Tref));\\r\\n\\r\\n  tm = tmref*exp(Em*(1.0/N_1-1.0/Tref));\\r\\n\\r\\n  tv = tvref*exp(Ev*(1.0/N_1-1.0/Tref));\\r\\n  \\r\\n  tl = tlref*exp(El*(1.0/N_1-1.0/Tref));\\r\\n\\r\\n  af = R1LipSzab(f, q, C, ms, rho, S, tm, tR, tv, r, Delta2, Aoh, SLS, tl);  \\r\\n\\r\\n  return af;\\r\\n}\\r\\n\\r\\ndouble R1OSabh_fH(double f, double N, double *par);\\r\\n\\r\\ndouble R1OSabh_fH(double f, double N, double *par)\\r\\n{\\r\\n double C, S, a, D, tvref, Ev, Delta2, fn, Tref;\\r\\n \\r\\n\\r\\n C = par[2];\\r\\n S = par[5];\\r\\n a = par[19];\\r\\n D = par[18];\\r\\n tvref = par[8];\\r\\n Ev = par[11];\\r\\n Delta2 = par[13];\\r\\n fn = par[20];\\r\\n Tref = par[21];\\r\\n\\r\\ndouble tv, af; \\r\\n\\r\\ntv = tvref*exp(Ev*(1.0/N_1-1.0/Tref));\\r\\n\\r\\naf=R1OSabh(f, C, S, a, D, tv, Delta2, fn);\\r\\n \\r\\n return af;\\r\\n}\\r\\n\\r\\n\",\n");
                jsonBuilder.append("\"AuxDeclar\": \"double R1LipSzab_fH(), R1OSabh_fH()\",\n");
            }

        } else if (isModelFreeChecked) {
            jsonBuilder.append("\"Function\": \"R1=R1LipSzab_fH(f, N, par)\",\n");
            String parametersString = (String) data.get("ParametersString");
            jsonBuilder.append("\"Parameters\": \"").append(String.valueOf(data.getOrDefault("ParametersString", ""))).append("\",\n");

            jsonBuilder.append("\"AuxCode\": \"#include <stdio.h>\\r\\n#include <math.h>\\r\\n#include <stdlib.h>\\r\\n#include <string.h>\\r\\n#include \\\"globals.h\\\"\\r\\n#include \\\"struct.h\\\"\\r\\n#include \\\"userlib.h\\\"\\r\\n#include \\\"ndata.h\\\"\\r\\n#include \\\"mixed.h\\\"\\r\\n\\r\\n#define pi 3.1415926\\r\\n\\r\\n\\r\\ndouble R1LipSzab_fH(double f, double N, double *par);\\r\\n\\r\\ndouble R1LipSzab_fH(double f, double N, double *par)\\r\\n{\\r\\n double q, C, ms, rho,  S, tmref, trref, tvref, Em, Er, Ev, r, Delta2, Aoh, SLS, tlref, El, Tref;\\r\\n\\r\\n\\r\\n q = par[1];\\r\\n C = par[2];\\r\\n ms = par[3];\\r\\n rho = par[4];\\r\\n S = par[5];\\r\\n tmref = par[6];\\r\\n trref = par[7];\\r\\n tvref = par[8];\\r\\n Em = par[9];\\r\\n Er = par[10];\\r\\n Ev = par[11];\\r\\n r = par[12];\\r\\n Delta2 = par[13];\\r\\n Aoh = par[14];\\r\\n SLS = par[15];\\r\\n tlref = par[16];\\r\\n El = par[17];\\r\\n Tref = par[18];\\r\\n\\r\\n double tm, tR, tv, tl, af; \\r\\n\\r\\n  tR = trref*exp(Er*(1.0/N_1-1.0/Tref));\\r\\n\\r\\n  tm = tmref*exp(Em*(1.0/N_1-1.0/Tref));\\r\\n\\r\\n  tv = tvref*exp(Ev*(1.0/N_1-1.0/Tref));\\r\\n  \\r\\n  tl = tlref*exp(El*(1.0/N_1-1.0/Tref));\\r\\n\\r\\n  af = R1LipSzab(f, q, C, ms, rho, S, tm, tR, tv, r, Delta2, Aoh, SLS, tl);  \\r\\n\\r\\n  return af;\\r\\n}\\r\\n\\r\\n\",\n");
            jsonBuilder.append("\"AuxDeclar\": \"double R1LipSzab_fH()\",\n");

        } else if (isOuterSphereChecked) {
            jsonBuilder.append("\"Parameters\": \"").append(String.valueOf(data.getOrDefault("ParametersString", ""))).append("\",\n");
            String dmode = String.valueOf(data.getOrDefault("Dmode_svante", "X"));
            if (dmode.equals("Y")) {
                // D-discrete
                jsonBuilder.append("\"Function\": \"R1=R1ISsbm_fHD(f, N, par) \\\\+ R1OSabh_fHD(f, N, par)\",\n");
                jsonBuilder.append("\"AuxCode\": \"#include <stdio.h>\\r\\n#include <math.h>\\r\\n#include <stdlib.h>\\r\\n#include <string.h>\\r\\n#include \\\"globals.h\\\"\\r\\n#include \\\"struct.h\\\"\\r\\n#include \\\"userlib.h\\\"\\r\\n#include \\\"ndata.h\\\"\\r\\n#include \\\"mixed.h\\\"\\r\\n\\r\\n#define pi 3.1415926\\r\\n\\r\\n\\r\\n\\r\\ndouble R1ISsbm_fHD(double f, double N, double *par);\\r\\n\\r\\ndouble R1ISsbm_fHD(double f, double N, double *par)\\r\\n{\\r\\n double q, C, ms, rho,  S, tmref, trref, tvref, Em, Er, Ev, r, Delta2, Aoh, Tref;\\r\\n\\r\\n\\r\\n q = par[1];\\r\\n C = par[2];\\r\\n ms = par[3];\\r\\n rho = par[4];\\r\\n S = par[5];\\r\\n tmref = par[6];\\r\\n trref = par[7];\\r\\n tvref = par[8];\\r\\n Em = par[9];\\r\\n Er = par[10];\\r\\n Ev = par[11];\\r\\n r = par[12];\\r\\n Delta2 = par[13];\\r\\n Aoh = par[14];\\r\\n Tref = par[17];\\r\\n\\r\\n double tm, tR, tv, af; \\r\\n\\r\\n  tR = trref*exp(Er*(1.0/N_1-1.0/Tref));\\r\\n\\r\\n  tm = tmref*exp(Em*(1.0/N_1-1.0/Tref));\\r\\n\\r\\n  tv = tvref*exp(Ev*(1.0/N_1-1.0/Tref));\\r\\n\\r\\n  af = R1ISsbm(f, q, C, ms, rho, S, tm, tR, tv, r, Delta2, Aoh);  \\r\\n\\r\\n  return af;\\r\\n}\\r\\n\\r\\ndouble R1OSabh_fHD(double f, double N, double *par);\\r\\n\\r\\ndouble R1OSabh_fHD(double f, double N, double *par)\\r\\n{\\r\\n double C, S, a, D, tvref, Ev, Delta2, fn, Tref;\\r\\n\\r\\n C = par[2];\\r\\n S = par[5];\\r\\n a = par[15];\\r\\n D = N_3;\\r\\n tvref = par[8];\\r\\n Ev = par[11];\\r\\n Delta2 = par[13];\\r\\n fn = par[16];\\r\\n Tref = par[17];\\r\\n\\r\\ndouble tv, af; \\r\\n\\r\\ntv = tvref*exp(Ev*(1.0/N_1-1.0/Tref));\\r\\n\\r\\naf=R1OSabh(f, C, S, a, D, tv, Delta2, fn);\\r\\n \\r\\n return af;\\r\\n}\\r\\n\\r\\n\",\n");
                jsonBuilder.append("\"AuxDeclar\": \"double R1ISsbm_fHD(), R1OSabh_fHD()\",\n");
            } else {
                // D-general
                jsonBuilder.append("\"Function\": \"R1=R1ISsbm_fH(f, N, par) \\\\+ R1OSabh_fH(f, N, par)\",\n");
                jsonBuilder.append("\"AuxCode\": \"#include <stdio.h>\\r\\n#include <math.h>\\r\\n#include <stdlib.h>\\r\\n#include <string.h>\\r\\n#include \\\"globals.h\\\"\\r\\n#include \\\"struct.h\\\"\\r\\n#include \\\"userlib.h\\\"\\r\\n#include \\\"ndata.h\\\"\\r\\n#include \\\"mixed.h\\\"\\r\\n\\r\\n#define pi 3.1415926\\r\\n\\r\\ndouble R1ISsbm_fH(double f, double N, double *par);\\r\\ndouble R1ISsbm_fH(double f, double N, double *par)\\r\\n{\\r\\n double q, C, ms, rho,  S, tmref, trref, tvref, Em, Er, Ev, r, Delta2, Aoh, Tref;\\r\\n\\r\\n\\r\\n q = par[1];\\r\\n C = par[2];\\r\\n ms = par[3];\\r\\n rho = par[4];\\r\\n S = par[5];\\r\\n tmref = par[6];\\r\\n trref = par[7];\\r\\n tvref = par[8];\\r\\n Em = par[9];\\r\\n Er = par[10];\\r\\n Ev = par[11];\\r\\n r = par[12];\\r\\n Delta2 = par[13];\\r\\n Aoh = par[14];\\r\\n Tref = par[18];\\r\\n\\r\\n double tm, tR, tv, af; \\r\\n\\r\\n  tR = trref*exp(Er*(1.0/N_1-1.0/Tref));\\r\\n\\r\\n  tm = tmref*exp(Em*(1.0/N_1-1.0/Tref));\\r\\n\\r\\n  tv = tvref*exp(Ev*(1.0/N_1-1.0/Tref));\\r\\n\\r\\n  af = R1ISsbm(f, q, C, ms, rho, S, tm, tR, tv, r, Delta2, Aoh);  \\r\\n\\r\\n  return af;\\r\\n}\\r\\n\\r\\ndouble R1OSabh_fH(double f, double N, double *par);\\r\\n\\r\\ndouble R1OSabh_fH(double f, double N, double *par)\\r\\n{\\r\\n double C, S, a, D, tvref, Ev, Delta2, fn, Tref;\\r\\n \\r\\n C = par[2];\\r\\n S = par[5];\\r\\n a = par[16];\\r\\n D = par[15];\\r\\n tvref = par[8];\\r\\n Ev = par[11];\\r\\n Delta2 = par[13];\\r\\n fn = par[17];\\r\\n Tref = par[18];\\r\\n\\r\\ndouble tv, af; \\r\\n\\r\\ntv = tvref*exp(Ev*(1.0/N_1-1.0/Tref));\\r\\n\\r\\naf=R1OSabh(f, C, S, a, D, tv, Delta2, fn);\\r\\n \\r\\n return af;\\r\\n}\\r\\n\\r\\n\",\n");
                jsonBuilder.append("\"AuxDeclar\": \"double R1ISsbm_fH(), R1OSabh_fH()\",\n");
            }

        } else {
            jsonBuilder.append("\"Function\": \"R1=R1ISsbm_fH(f, N, par)\",\n");
            jsonBuilder.append("\"Parameters\": \"").append(String.valueOf(data.getOrDefault("ParametersString", ""))).append("\",\n");
            jsonBuilder.append("\"AuxCode\": \"#include <stdio.h>\\r\\n#include <math.h>\\r\\n#include <stdlib.h>\\r\\n#include <string.h>\\r\\n#include \\\"globals.h\\\"\\r\\n#include \\\"struct.h\\\"\\r\\n#include \\\"userlib.h\\\"\\r\\n#include \\\"ndata.h\\\"\\r\\n#include \\\"mixed.h\\\"\\r\\n\\r\\n#define pi 3.1415926\\r\\n\\r\\n\\r\\n\\r\\ndouble R1ISsbm_fH(double f, double N, double *par);\\r\\ndouble R1ISsbm_fH(double f, double N, double *par)\\r\\n{\\r\\n double q, C, ms, rho,  S, tmref, trref, tvref, Em, Er, Ev, r, Delta2, Aoh, Tref;\\r\\n\\r\\n q = par[1];\\r\\n C = par[2];\\r\\n ms = par[3];\\r\\n rho = par[4];\\r\\n S = par[5];\\r\\n tmref = par[6];\\r\\n trref = par[7];\\r\\n tvref = par[8];\\r\\n Em = par[9];\\r\\n Er = par[10];\\r\\n Ev = par[11];\\r\\n r = par[12];\\r\\n Delta2 = par[13];\\r\\n Aoh = par[14];\\r\\n Tref = par[15];\\r\\n\\r\\n double tm, tR, tv, af; \\r\\n\\r\\n  tR = trref*exp(Er*(1.0/Tref-1.0/N_1));\\r\\n\\r\\n  tm = tmref*exp(Em*(1.0/Tref-1.0/N_1));\\r\\n\\r\\n  tv = tvref*exp(Ev*(1.0/Tref-1.0/N_1));\\r\\n\\r\\n  af = R1ISsbm(f, q, C, ms, rho, S, tm, tR, tv, r, Delta2, Aoh);  \\r\\n\\r\\n  return af;\\r\\n}\\r\\n\\r\\n\",\n");        }
        String dados = data.get("dados") != null ? data.get("dados").toString()
                : (data.get("Dados") != null ? data.get("Dados").toString() : "");

        dados = dados.replace("\r\n", "\n").replace("\r", "\n");
        if (dados.contains("<Add input here>") || dados.trim().isEmpty()) {

            dados = "# DATA dum = " + data.get("ProfileIndex") +
                    "\n# TAG = " +
                    (
                            (data.get("ProfileName") == null || data.get("ProfileName").toString().isEmpty())
                                    ? ("Profile " + data.get("ProfileIndex"))
                                    : data.get("ProfileName")
                    ) +
                    "\n# UNIT = Hz\n" +
                    "1000000000 2.5 1\n700000000 2.5 1\n600000000 2.5 1\n400000000 2.5 1\n200000000 2.5 1\n100000000 2.5 1\n80000000 2.5 1\n60000000 2.5 1\n40000000 2.5 1\n20000000 2.5 1\n10000000 2.5 1\n7500000 2.5 1\n5000000 2.5 1\n2500000 2.5 1\n1000000 2.5 1\n600000 2.5 1\n300000 2.5 1\n150000 2.5 1\n100000 2.5 1\n80000 2.5 1\n70000 2.5 1\n60000 2.5 1\n50000 2.5 1\n45000 2.5 1\n40000 2.5 1\n35000 2.5 1\n30000 2.5 1\n25000 2.5 1\n20000 2.5 1\n15000 2.5 1\n10000 2.5 1";
        }

        jsonBuilder.append("\"Dados\": \"")
                .append(dados
                        .replace("\\", "\\\\")
                        .replace("\"", "\\\"")
                        .replace("\n", "\\n"))
                .append("\",\n");

        List<String> tabs = new ArrayList<>();
        Object maybeArray = data.get("AllTabs");
        if (maybeArray instanceof List) {
            for (Object o : (List<?>) maybeArray) {
                if (o != null) tabs.add(String.valueOf(o));
            }
        }


        jsonBuilder.append("\"Tags\": [\n");
        for (int i = 0; i < tabs.size(); i++) {
            jsonBuilder.append("  \"")
                    .append(tabs.get(i).replace("\\", "\\\\").replace("\"", "\\\""))
                    .append("\"");
            if (i < tabs.size() - 1) jsonBuilder.append(",");
            jsonBuilder.append("\n");
        }
        jsonBuilder.append("],\n");

// === SELECTED DATASET ===
        String active = String.valueOf(data.getOrDefault("ActiveTab", ""));
        jsonBuilder.append("\"SelectedDataSet\": \"")
                .append(active.replace("\\", "\\\\").replace("\"", "\\\""))
                .append("\"\n");


        jsonBuilder.append("}\n");
        return jsonBuilder.toString();
    }


    @PostMapping("/saveTabData_florence_svante")
    @ResponseBody
    public ResponseEntity<Map<String, String>> saveTabData_florence_svante(@RequestBody Map<String, Object> data) {
        String jsonDir = "/home/ofe/public_html/json/";
        File directory = new File(jsonDir);
        if (!directory.exists()) directory.mkdirs();

        // FLAG logic kept: florence -> 1, modflorence -> 2
        // FLAG index taken from labels (26, or 25 when D discrete removes DDM)
        String variant   = String.valueOf(data.getOrDefault("Variant", "florence"));
        String modelFlag = "modflorence".equals(variant) ? "2" : "1";
        String[] labelArr = String.valueOf(data.getOrDefault("ParametersString", "")).split(",");
        for (int i = 0; i < labelArr.length; i++) {
            if ("FLAG".equals(labelArr[i].trim())) {
                data.put("F" + i, "Fix");
                data.put("Pval" + i, modelFlag);
                data.put("Pmin" + i, "");
                data.put("Pmax" + i, "");
                break;
            }
        }

        // *_florence_arrh.json (must not end with _arrhenius.json -> would collide with svante)
        final String fileSuffix = "_" + variant + "_svante.json";

        File[] existing = directory.listFiles((dir, name) -> name.endsWith(fileSuffix));
        if (existing != null && existing.length > 0) {
            Arrays.sort(existing, Comparator.comparingLong(File::lastModified));
            existing[0].delete();
        }

        String timestamp = new SimpleDateFormat("yyyyMMdd_HHmm").format(new Date());
        String jsonFileName = timestamp + fileSuffix;
        String jsonFilePath = jsonDir + jsonFileName;

        try (FileWriter file = new FileWriter(jsonFilePath)) {
            file.write(generateJSON_florence_svante(data));
            return ResponseEntity.ok(Map.of("message", "Florence Arrhenius data saved successfully.", "filename", jsonFileName));
        } catch (IOException e) {
            e.printStackTrace();
            return ResponseEntity.status(500).body(Map.of("message", "Failed to save Florence Arrhenius data."));
        }
    }

    private String generateJSON_florence_svante(Map<String, Object> data) {
        StringBuilder jsonBuilder = new StringBuilder("{\n");

        String parametersStr = String.valueOf(data.getOrDefault("ParametersString", ""));

        Set<Integer> sharedFixIndices = new HashSet<>();
        if (!parametersStr.isEmpty()) {
            String[] paramLabels = parametersStr.split(",");
            for (int pi = 0; pi < paramLabels.length; pi++) {
                if (paramLabels[pi].trim().endsWith("_")) {
                    sharedFixIndices.add(pi);
                }
            }
        }

        int k = 0;
        while (data.containsKey("F"+k) || data.containsKey("Pval"+k) || data.containsKey("Pmin"+k) || data.containsKey("Pmax"+k)) {
            String fValK    = String.valueOf(data.getOrDefault("F"+k, ""));
            boolean isFixK  = "Fix".equalsIgnoreCase(fValK);
            boolean suppressBounds = isFixK && !sharedFixIndices.contains(k);
            jsonBuilder.append("\"F").append(k).append("\": \"").append(fValK).append("\",\n");
            jsonBuilder.append("\"Pval").append(k).append("\": \"").append(String.valueOf(data.getOrDefault("Pval"+k, ""))).append("\",\n");
            jsonBuilder.append("\"Pmin").append(k).append("\": \"").append(suppressBounds ? "" : String.valueOf(data.getOrDefault("Pmin"+k, ""))).append("\",\n");
            jsonBuilder.append("\"Pmax").append(k).append("\": \"").append(suppressBounds ? "" : String.valueOf(data.getOrDefault("Pmax"+k, ""))).append("\",\n");
            k++;
        }

        jsonBuilder.append("\"Traco0\": \"3-dashed\",\n");
        jsonBuilder.append("\"X\": \"f\",\n");
        jsonBuilder.append("\"Xmax\": \"1e+08\",\n");
        jsonBuilder.append("\"Xmin\": \"6000\",\n");
        jsonBuilder.append("\"Y\": \"R1\",\n");
        jsonBuilder.append("\"Ymax\": \"50\",\n");
        jsonBuilder.append("\"Ymin\": \"0\",\n");
        jsonBuilder.append("\"FitType\": \"Global\",\n");
        jsonBuilder.append("\"Func0\": \"\",\n");
        jsonBuilder.append("\"AscaleX\": \"yes\",\n");
        jsonBuilder.append("\"AscaleY\": \"yes\",\n");
        jsonBuilder.append("\"Cor0\": \"2-red\",\n");
        jsonBuilder.append("\"FitMethods\": \"simp scan min\",\n");
        jsonBuilder.append("\"Funcx0\": \"auto\",\n");
        jsonBuilder.append("\"Funcy0\": \"auto\",\n");
        jsonBuilder.append("\"T\": \"N\",\n");

        boolean ls  = Boolean.parseBoolean(String.valueOf(data.getOrDefault("ModelFree", "false")));
        boolean os  = Boolean.parseBoolean(String.valueOf(data.getOrDefault("OuterSphere", "false")));
        boolean ss  = Boolean.parseBoolean(String.valueOf(data.getOrDefault("SecondSphere", "false")));
        boolean dDiscrete = os && "Y".equals(String.valueOf(data.getOrDefault("Dmode", "X")));

        String caseKey = "FLORENCE"
                + (ls ? "+LS" : "")
                + (os ? "+FREED" : "")
                + (ss ? "+SS" : "")
                + (dDiscrete ? "+DDISCRETE" : "");

        jsonBuilder.append("\"Parameters\": \"").append(parametersStr).append("\",\n");

        switch (caseKey) {
            case "FLORENCE": // 1. Florence
                jsonBuilder.append("\"Function\": \"R1=FlorenceN_fH(f, N, par)\",\n");
                jsonBuilder.append("\"AuxCode\": \"#include <stdio.h>\\r\\n#include <math.h>\\r\\n#include <stdlib.h>\\r\\n#include <string.h>\\r\\n#include \\\"globals.h\\\"\\r\\n#include \\\"struct.h\\\"\\r\\n#include \\\"userlib.h\\\"\\r\\n#include \\\"ndata.h\\\"\\r\\n#include \\\"mixed.h\\\"\\r\\n\\r\\n#define pi 3.1415926\\r\\n\\r\\ndouble FlorenceN_fH(double f, double N, double *par);\\r\\ndouble FlorenceN_fH(double f, double N, double *par)\\r\\n{\\r\\n    double SI, GAMMAI, SPIN, DELTA2, TAURMref, TAUVMref, TAUMMref, ERM, EVM, EMM, DPARAM, EPARAM, GXM, GYM, GZM, AXM, AYM, AZM, CONCM, RKM, DM, DDM, ACONTM, AMOLFRAM, THETAM, PHIM, FLAG, Tref, FN;\\r\\n\\r\\n    SI = par[1];\\r\\n    GAMMAI = par[2];\\r\\n    SPIN = par[3];\\r\\n    DELTA2 = par[4];   \\r\\n    TAURMref = par[5];\\r\\n    TAUVMref = par[6];\\r\\n    TAUMMref = par[7];\\r\\n    ERM = par[8];\\r\\n    EVM = par[9];\\r\\n    EMM = par[10];\\r\\n    DPARAM = par[11];\\r\\n    EPARAM = par[12];\\r\\n    GXM = par[13];\\r\\n    GYM = par[14];\\r\\n    GZM = par[15];\\r\\n    AXM = par[16];\\r\\n    AYM = par[17];\\r\\n    AZM = par[18];\\r\\n    CONCM = par[19];\\r\\n    RKM = par[20];\\r\\n    DM = par[21];\\r\\n    DDM = par[22];\\r\\n    ACONTM = par[23];\\r\\n    AMOLFRAM = par[24];\\r\\n    THETAM = par[25];\\r\\n    PHIM = par[26];\\r\\n    FLAG = par[27];\\r\\n    Tref = par[28];\\r\\n    FN = par[29];\\r\\n\\r\\n    double TAURM, TAUVM, TAUMM, af;\\r\\n\\r\\n    TAURM = TAURMref*exp(ERM*(1.0/N_1-1.0/Tref));\\r\\n    TAUVM = TAUVMref*exp(EVM*(1.0/N_1-1.0/Tref));\\r\\n    TAUMM = TAUMMref*exp(EMM*(1.0/N_1-1.0/Tref));    \\r\\n\\r\\n    af = FlorenceN(1.0,3.0,f, SI, GAMMAI, SPIN, 1.0, DELTA2, TAURM, TAUVM, TAUMM, DPARAM, EPARAM, 0.0, GXM, GYM, GZM, AXM, AYM, AZM, DM, DDM, CONCM, 1.0, AMOLFRAM, RKM, ACONTM, THETAM, PHIM, FLAG) + FlorenceN(2.0,3.0,f, SI, GAMMAI, SPIN, 1.0, DELTA2, TAURM, TAUVM, TAUMM, DPARAM, EPARAM, 0.0, GXM, GYM, GZM, AXM, AYM, AZM, DM, DDM, CONCM, 1.0, AMOLFRAM, RKM, ACONTM, THETAM, PHIM, FLAG) + FlorenceN(3.0,3.0,f, SI, GAMMAI, SPIN, 1.0, DELTA2, TAURM, TAUVM, TAUMM, DPARAM, EPARAM, 0.0, GXM, GYM, GZM, AXM, AYM, AZM, DM, DDM, CONCM, 1.0, AMOLFRAM, RKM, ACONTM, THETAM, PHIM, FLAG);\\r\\n    \\r\\n    return af;\\r\\n     \\r\\n}\",\n");
                jsonBuilder.append("\"AuxDeclar\": \"double FlorenceN_fH()\",\n");
                break;
            case "FLORENCE+FREED": // 2. Florence + Freed
                jsonBuilder.append("\"Function\": \"R1=FlorenceN_fH(f, N, par) \\\\+ R1OSabh_hybrid(f, N, par)\",\n");
                jsonBuilder.append("\"AuxCode\": \"#include <stdio.h>\\r\\n#include <math.h>\\r\\n#include <stdlib.h>\\r\\n#include <string.h>\\r\\n#include \\\"globals.h\\\"\\r\\n#include \\\"struct.h\\\"\\r\\n#include \\\"userlib.h\\\"\\r\\n#include \\\"ndata.h\\\"\\r\\n#include \\\"mixed.h\\\"\\r\\n\\r\\n#define pi 3.1415926\\r\\n\\r\\ndouble FlorenceN_fH(double f, double N, double *par);\\r\\ndouble FlorenceN_fH(double f, double N, double *par)\\r\\n{\\r\\n    double SI, GAMMAI, SPIN, DELTA2, TAURMref, TAUVMref, TAUMMref, ERM, EVM, EMM, DPARAM, EPARAM, GXM, GYM, GZM, AXM, AYM, AZM, CONCM, RKM, DM, DDM, ACONTM, AMOLFRAM, THETAM, PHIM, FLAG, Tref;\\r\\n\\r\\n    SI = par[1];\\r\\n    GAMMAI = par[2];\\r\\n    SPIN = par[3];\\r\\n    DELTA2 = par[4];   \\r\\n    TAURMref = par[5];\\r\\n    TAUVMref = par[6];\\r\\n    TAUMMref = par[7];\\r\\n    ERM = par[8];\\r\\n    EVM = par[9];\\r\\n    EMM = par[10];\\r\\n    DPARAM = par[11];\\r\\n    EPARAM = par[12];\\r\\n    GXM = par[13];\\r\\n    GYM = par[14];\\r\\n    GZM = par[15];\\r\\n    AXM = par[16];\\r\\n    AYM = par[17];\\r\\n    AZM = par[18];\\r\\n    CONCM = par[19];\\r\\n    RKM = par[20];\\r\\n    DM = par[21];\\r\\n    DDM = par[22];\\r\\n    ACONTM = par[23];\\r\\n    AMOLFRAM = par[24];\\r\\n    THETAM = par[25];\\r\\n    PHIM = par[26];\\r\\n    FLAG = par[27];\\r\\n    Tref = par[28];\\r\\n\\r\\n    double TAURM, TAUVM, TAUMM, af;\\r\\n\\r\\n    TAURM = TAURMref*exp(ERM*(1.0/N_1-1.0/Tref));\\r\\n    TAUVM = TAUVMref*exp(EVM*(1.0/N_1-1.0/Tref));\\r\\n    TAUMM = TAUMMref*exp(EMM*(1.0/N_1-1.0/Tref));    \\r\\n\\r\\n    af = FlorenceN(1.0,3.0,f, SI, GAMMAI, SPIN, 1.0, DELTA2, TAURM, TAUVM, TAUMM, DPARAM, EPARAM, 0.0, GXM, GYM, GZM, AXM, AYM, AZM, DM, DDM, CONCM, 1.0, AMOLFRAM, RKM, ACONTM, THETAM, PHIM, FLAG) + FlorenceN(2.0,3.0,f, SI, GAMMAI, SPIN, 1.0, DELTA2, TAURM, TAUVM, TAUMM, DPARAM, EPARAM, 0.0, GXM, GYM, GZM, AXM, AYM, AZM, DM, DDM, CONCM, 1.0, AMOLFRAM, RKM, ACONTM, THETAM, PHIM, FLAG) + FlorenceN(3.0,3.0,f, SI, GAMMAI, SPIN, 1.0, DELTA2, TAURM, TAUVM, TAUMM, DPARAM, EPARAM, 0.0, GXM, GYM, GZM, AXM, AYM, AZM, DM, DDM, CONCM, 1.0, AMOLFRAM, RKM, ACONTM, THETAM, PHIM, FLAG);\\r\\n    \\r\\n    return af;\\r\\n     \\r\\n}\\r\\n\\r\\ndouble R1OSabh_hybrid(double f, double N, double *par);\\r\\ndouble R1OSabh_hybrid(double f, double N, double *par)\\r\\n{\\r\\n    double CONCM, SPIN, DM, DDM, TAUVMref, TAUVM, EVM, DELTA2, FN, af, Tref;\\r\\n\\r\\n    CONCM = par[19];\\r\\n    SPIN = par[3];\\r\\n    DM = par[21];\\r\\n    DDM = par[22];\\r\\n    TAUVMref = par[6];\\r\\n    EVM = par[9];\\r\\n    DELTA2 = par[4];\\r\\n    FN = par[29];\\r\\n    Tref = par[28];\\r\\n\\r\\n    TAUVM = TAUVMref*exp(EVM*(1.0/N_1-1.0/Tref));\\r\\n\\r\\n    af=R1OSabh(f, CONCM*1e3, SPIN, DM, DDM, TAUVM, pow(1.883636123e11*DELTA2, 2.0),FN);\\r\\n\\r\\n    return af;\\r\\n}\",\n");
                jsonBuilder.append("\"AuxDeclar\": \"double FlorenceN_fH(), R1OSabh_hybrid()\",\n");
                break;
            case "FLORENCE+LS": // 3. Florence + Lipari-Szabo
                jsonBuilder.append("\"Function\": \"R1=FlorenceN4LS_fH(f, N, par)\",\n");
                jsonBuilder.append("\"AuxCode\": \"#include <stdio.h>\\r\\n#include <math.h>\\r\\n#include <stdlib.h>\\r\\n#include <string.h>\\r\\n#include \\\"globals.h\\\"\\r\\n#include \\\"struct.h\\\"\\r\\n#include \\\"userlib.h\\\"\\r\\n#include \\\"ndata.h\\\"\\r\\n#include \\\"mixed.h\\\"\\r\\n\\r\\n#define pi 3.1415926\\r\\n\\r\\ndouble FlorenceN4LS_fH(double f, double N, double *par);\\r\\ndouble FlorenceN4LS_fH(double f, double N, double *par)\\r\\n{\\r\\n    double SI, GAMMAI, SPIN, DELTA2, TAURMref, TAUVMref, TAUMMref, ERM, EVM, EMM, DPARAM, EPARAM, GXM, GYM, GZM, AXM, AYM, AZM, CONCM, RKM, DM, DDM, ACONTM, AMOLFRAM, THETAM, PHIM, FLAG, SLS, TAULMref, ELM, Tref;\\r\\n\\r\\n    SI = par[1];\\r\\n    GAMMAI = par[2];\\r\\n    SPIN = par[3];\\r\\n    DELTA2 = par[4];   \\r\\n    TAURMref = par[5];\\r\\n    TAUVMref = par[6];\\r\\n    TAUMMref = par[7];\\r\\n    ERM = par[8];\\r\\n    EVM = par[9];\\r\\n    EMM = par[10];\\r\\n    DPARAM = par[11];\\r\\n    EPARAM = par[12];\\r\\n    GXM = par[13];\\r\\n    GYM = par[14];\\r\\n    GZM = par[15];\\r\\n    AXM = par[16];\\r\\n    AYM = par[17];\\r\\n    AZM = par[18];\\r\\n    CONCM = par[19];\\r\\n    RKM = par[20];\\r\\n    DM = par[21];\\r\\n    DDM = par[22];\\r\\n    ACONTM = par[23];\\r\\n    AMOLFRAM = par[24];\\r\\n    THETAM = par[25];\\r\\n    PHIM = par[26];\\r\\n    FLAG = par[27];\\r\\n    SLS = par[28];\\r\\n    TAULMref = par[29];\\r\\n    ELM = par[30];\\r\\n    Tref = par[31];\\r\\n\\r\\n    double TAURM, TAUVM, TAUMM, TAULM, af;\\r\\n\\r\\n    TAURM = TAURMref*exp(ERM*(1.0/N_1-1.0/Tref));\\r\\n    TAUVM = TAUVMref*exp(EVM*(1.0/N_1-1.0/Tref));\\r\\n    TAUMM = TAUMMref*exp(EMM*(1.0/N_1-1.0/Tref));    \\r\\n    TAULM = TAULMref*exp(ELM*(1.0/N_1-1.0/Tref));    \\r\\n\\r\\n    af = SLS*FlorenceN(1.0,3.0,f, SI, GAMMAI, SPIN, 1.0, DELTA2, TAURM, TAUVM, TAUMM, DPARAM, EPARAM, 0.0, GXM, GYM, GZM, AXM, AYM, AZM, 0.0, 0.0, CONCM, 1.0, AMOLFRAM, RKM, ACONTM, THETAM, PHIM, FLAG) + (1-SLS)*FlorenceN4LS(1.0,3.0,f, SI, GAMMAI, SPIN, 1.0, DELTA2, TAULM, TAUVM, TAUMM, DPARAM, EPARAM, 0.0, GXM, GYM, GZM, AXM, AYM, AZM, 0.0, 0.0, CONCM, 1.0, AMOLFRAM, RKM, ACONTM, THETAM, PHIM, FLAG) + SLS*FlorenceN(2.0,3.0,f, SI, GAMMAI, SPIN, 1.0, DELTA2, TAURM, TAUVM, TAUMM, DPARAM, EPARAM, 0.0, GXM, GYM, GZM, AXM, AYM, AZM, 0.0, 0.0, CONCM, 1.0, AMOLFRAM, RKM, ACONTM, THETAM, PHIM, FLAG) + (1-SLS)*FlorenceN4LS(2.0,3.0,f, SI, GAMMAI, SPIN, 1.0, DELTA2, TAULM, TAUVM, TAUMM, DPARAM, EPARAM, 0.0, GXM, GYM, GZM, AXM, AYM, AZM, 0.0, 0.0, CONCM, 1.0, AMOLFRAM, RKM, ACONTM, THETAM, PHIM, FLAG) + SLS*FlorenceN(3.0,3.0,f, SI, GAMMAI, SPIN, 1.0, DELTA2, TAURM, TAUVM, TAUMM, DPARAM, EPARAM, 0.0, GXM, GYM, GZM, AXM, AYM, AZM, 0.0, 0.0, CONCM, 1.0, AMOLFRAM, RKM, ACONTM, THETAM, PHIM, FLAG) + (1-SLS)*FlorenceN4LS(3.0,3.0,f, SI, GAMMAI, SPIN, 1.0, DELTA2, TAULM, TAUVM, TAUMM, DPARAM, EPARAM, 0.0, GXM, GYM, GZM, AXM, AYM, AZM, 0.0, 0.0, CONCM, 1.0, AMOLFRAM, RKM, ACONTM, THETAM, PHIM, FLAG);\\r\\n    \\r\\n    return af;\\r\\n     \\r\\n}\",\n");
                jsonBuilder.append("\"AuxDeclar\": \"double FlorenceN4LS_fH()\",\n");
                break;
            case "FLORENCE+LS+FREED": // 4. Florence + Lipari-Szabo + Freed
                jsonBuilder.append("\"Function\": \"R1 = FlorenceN4LS_fH(f, N, par) \\\\+ R1OSabh_hybrid(f, N, par)\",\n");
                jsonBuilder.append("\"AuxCode\": \"#include <stdio.h>\\r\\n#include <math.h>\\r\\n#include <stdlib.h>\\r\\n#include <string.h>\\r\\n#include \\\"globals.h\\\"\\r\\n#include \\\"struct.h\\\"\\r\\n#include \\\"userlib.h\\\"\\r\\n#include \\\"ndata.h\\\"\\r\\n#include \\\"mixed.h\\\"\\r\\n\\r\\n#define pi 3.1415926\\r\\n\\r\\ndouble FlorenceN4LS_fH(double f, double N, double *par);\\r\\ndouble FlorenceN4LS_fH(double f, double N, double *par)\\r\\n{\\r\\n    double SI, GAMMAI, SPIN, DELTA2, TAURMref, TAUVMref, TAUMMref, ERM, EVM, EMM, DPARAM, EPARAM, GXM, GYM, GZM, AXM, AYM, AZM, CONCM, RKM, DM, DDM, ACONTM, AMOLFRAM, THETAM, PHIM, FLAG, SLS, TAULMref, ELM, Tref;\\r\\n\\r\\n    SI = par[1];\\r\\n    GAMMAI = par[2];\\r\\n    SPIN = par[3];\\r\\n    DELTA2 = par[4];   \\r\\n    TAURMref = par[5];\\r\\n    TAUVMref = par[6];\\r\\n    TAUMMref = par[7];\\r\\n    ERM = par[8];\\r\\n    EVM = par[9];\\r\\n    EMM = par[10];\\r\\n    DPARAM = par[11];\\r\\n    EPARAM = par[12];\\r\\n    GXM = par[13];\\r\\n    GYM = par[14];\\r\\n    GZM = par[15];\\r\\n    AXM = par[16];\\r\\n    AYM = par[17];\\r\\n    AZM = par[18];\\r\\n    CONCM = par[19];\\r\\n    RKM = par[20];\\r\\n    DM = par[21];\\r\\n    DDM = par[22];\\r\\n    ACONTM = par[23];\\r\\n    AMOLFRAM = par[24];\\r\\n    THETAM = par[25];\\r\\n    PHIM = par[26];\\r\\n    FLAG = par[27];\\r\\n    Tref = par[28];\\r\\n    SLS = par[30];\\r\\n    TAULMref = par[31];\\r\\n    ELM = par[32];\\r\\n\\r\\n\\r\\n    double TAURM, TAUVM, TAUMM, TAULM, af;\\r\\n\\r\\n    TAURM = TAURMref*exp(ERM*(1.0/N_1-1.0/Tref));\\r\\n    TAUVM = TAUVMref*exp(EVM*(1.0/N_1-1.0/Tref));\\r\\n    TAUMM = TAUMMref*exp(EMM*(1.0/N_1-1.0/Tref));    \\r\\n    TAULM = TAULMref*exp(ELM*(1.0/N_1-1.0/Tref));    \\r\\n\\r\\n    af = SLS*FlorenceN(1.0,3.0,f, SI, GAMMAI, SPIN, 1.0, DELTA2, TAURM, TAUVM, TAUMM, DPARAM, EPARAM, 0.0, GXM, GYM, GZM, AXM, AYM, AZM, 0.0, 0.0, CONCM, 1.0, AMOLFRAM, RKM, ACONTM, THETAM, PHIM, FLAG) + (1-SLS)*FlorenceN4LS(1.0,3.0,f, SI, GAMMAI, SPIN, 1.0, DELTA2, TAULM, TAUVM, TAUMM, DPARAM, EPARAM, 0.0, GXM, GYM, GZM, AXM, AYM, AZM, 0.0, 0.0, CONCM, 1.0, AMOLFRAM, RKM, ACONTM, THETAM, PHIM, FLAG) + SLS*FlorenceN(2.0,3.0,f, SI, GAMMAI, SPIN, 1.0, DELTA2, TAURM, TAUVM, TAUMM, DPARAM, EPARAM, 0.0, GXM, GYM, GZM, AXM, AYM, AZM, 0.0, 0.0, CONCM, 1.0, AMOLFRAM, RKM, ACONTM, THETAM, PHIM, FLAG) + (1-SLS)*FlorenceN4LS(2.0,3.0,f, SI, GAMMAI, SPIN, 1.0, DELTA2, TAULM, TAUVM, TAUMM, DPARAM, EPARAM, 0.0, GXM, GYM, GZM, AXM, AYM, AZM, 0.0, 0.0, CONCM, 1.0, AMOLFRAM, RKM, ACONTM, THETAM, PHIM, FLAG) + SLS*FlorenceN(3.0,3.0,f, SI, GAMMAI, SPIN, 1.0, DELTA2, TAURM, TAUVM, TAUMM, DPARAM, EPARAM, 0.0, GXM, GYM, GZM, AXM, AYM, AZM, 0.0, 0.0, CONCM, 1.0, AMOLFRAM, RKM, ACONTM, THETAM, PHIM, FLAG) + (1-SLS)*FlorenceN4LS(3.0,3.0,f, SI, GAMMAI, SPIN, 1.0, DELTA2, TAULM, TAUVM, TAUMM, DPARAM, EPARAM, 0.0, GXM, GYM, GZM, AXM, AYM, AZM, 0.0, 0.0, CONCM, 1.0, AMOLFRAM, RKM, ACONTM, THETAM, PHIM, FLAG);\\r\\n    \\r\\n    return af;\\r\\n     \\r\\n}\\r\\n\\r\\ndouble R1OSabh_hybrid(double f, double N, double *par);\\r\\ndouble R1OSabh_hybrid(double f, double N, double *par)\\r\\n{\\r\\n    double CONCM, SPIN, DM, DDM, TAUVMref,TAUVM, EVM, DELTA2, FN, Tref, af;\\r\\n\\r\\n    CONCM = par[19];\\r\\n    SPIN = par[3];\\r\\n    DM = par[21];\\r\\n    DDM = par[22];\\r\\n    TAUVMref = par[6];\\r\\n    EVM = par[9];\\r\\n    DELTA2 = par[4];\\r\\n    FN = par[29];\\r\\n    Tref = par[28];\\r\\n\\r\\n    TAUVM = TAUVMref*exp(EVM*(1.0/N_1-1.0/Tref));\\r\\n\\r\\n    af=R1OSabh(f, CONCM*1e3, SPIN, DM, DDM, TAUVM, pow(1.883636123e11*DELTA2, 2.0),FN);\\r\\n\\r\\n    return af;\\r\\n}\",\n");
                jsonBuilder.append("\"AuxDeclar\": \"double FlorenceN4LS_fH(), R1OSabh_hybrid()\",\n");
                break;
            case "FLORENCE+SS": // 5. Florence + SS
                jsonBuilder.append("\"Function\": \"R1= FlorenceN_fH(f, N, par) \\\\+ FlorenceN_fH_SS(f, N, par)\",\n");
                jsonBuilder.append("\"AuxCode\": \"#include <stdio.h>\\r\\n#include <math.h>\\r\\n#include <stdlib.h>\\r\\n#include <string.h>\\r\\n#include \\\"globals.h\\\"\\r\\n#include \\\"struct.h\\\"\\r\\n#include \\\"userlib.h\\\"\\r\\n#include \\\"ndata.h\\\"\\r\\n#include \\\"mixed.h\\\"\\r\\n\\r\\n#define pi 3.1415926\\r\\n\\r\\ndouble FlorenceN_fH(double f, double N, double *par);\\r\\ndouble FlorenceN_fH(double f, double N, double *par)\\r\\n{\\r\\n    double SI, GAMMAI, SPIN, DELTA2, TAURMref, TAUVMref, TAUMMref, ERM, EVM, EMM, DPARAM, EPARAM, GXM, GYM, GZM, AXM, AYM, AZM, CONCM, RKM, DM, DDM, ACONTM, AMOLFRAM, THETAM, PHIM, FLAG, Tref, FN;\\r\\n\\r\\n    SI = par[1];\\r\\n    GAMMAI = par[2];\\r\\n    SPIN = par[3];\\r\\n    DELTA2 = par[4];   \\r\\n    TAURMref = par[5];\\r\\n    TAUVMref = par[6];\\r\\n    TAUMMref = par[7];\\r\\n    ERM = par[8];\\r\\n    EVM = par[9];\\r\\n    EMM = par[10];\\r\\n    DPARAM = par[11];\\r\\n    EPARAM = par[12];\\r\\n    GXM = par[13];\\r\\n    GYM = par[14];\\r\\n    GZM = par[15];\\r\\n    AXM = par[16];\\r\\n    AYM = par[17];\\r\\n    AZM = par[18];\\r\\n    CONCM = par[19];\\r\\n    RKM = par[20];\\r\\n    DM = par[21];\\r\\n    DDM = par[22];\\r\\n    ACONTM = par[23];\\r\\n    AMOLFRAM = par[24];\\r\\n    THETAM = par[25];\\r\\n    PHIM = par[26];\\r\\n    FLAG = par[27];\\r\\n    Tref = par[28];\\r\\n    FN = par[29];\\r\\n\\r\\n    double TAURM, TAUVM, TAUMM, af;\\r\\n\\r\\n    TAURM = TAURMref*exp(ERM*(1.0/N_1-1.0/Tref));\\r\\n    TAUVM = TAUVMref*exp(EVM*(1.0/N_1-1.0/Tref));\\r\\n    TAUMM = TAUMMref*exp(EMM*(1.0/N_1-1.0/Tref));    \\r\\n\\r\\n    af = FlorenceN(1.0,3.0,f, SI, GAMMAI, SPIN, 1.0, DELTA2, TAURM, TAUVM, TAUMM, DPARAM, EPARAM, 0.0, GXM, GYM, GZM, AXM, AYM, AZM, DM, DDM, CONCM, 1.0, AMOLFRAM, RKM, ACONTM, THETAM, PHIM, FLAG) + FlorenceN(2.0,3.0,f, SI, GAMMAI, SPIN, 1.0, DELTA2, TAURM, TAUVM, TAUMM, DPARAM, EPARAM, 0.0, GXM, GYM, GZM, AXM, AYM, AZM, DM, DDM, CONCM, 1.0, AMOLFRAM, RKM, ACONTM, THETAM, PHIM, FLAG) + FlorenceN(3.0,3.0,f, SI, GAMMAI, SPIN, 1.0, DELTA2, TAURM, TAUVM, TAUMM, DPARAM, EPARAM, 0.0, GXM, GYM, GZM, AXM, AYM, AZM, DM, DDM, CONCM, 1.0, AMOLFRAM, RKM, ACONTM, THETAM, PHIM, FLAG);\\r\\n    \\r\\n    return af;\\r\\n     \\r\\n}\\r\\n\\r\\ndouble FlorenceN_fH_SS(double f, double N, double *par);\\r\\ndouble FlorenceN_fH_SS(double f, double N, double *par)\\r\\n{\\r\\n    double SI, GAMMAI, SPIN, DELTA2, TAURMref, TAUVMref, TAUMMref2, ERM, EVM, EMM2, DPARAM, EPARAM, GXM, GYM, GZM, AXM, AYM, AZM, CONCM, RKM2, DM, DDM, ACONTM, AMOLFRAM2, THETAM, PHIM, FLAG, Tref, FN;\\r\\n\\r\\n    SI = par[1];\\r\\n    GAMMAI = par[2];\\r\\n    SPIN = par[3];\\r\\n    DELTA2 = par[4];   \\r\\n    TAURMref = par[5];\\r\\n    TAUVMref = par[6];\\r\\n    TAUMMref2 = par[30];\\r\\n    ERM = par[8];\\r\\n    EVM = par[9];\\r\\n    EMM2 = par[31];\\r\\n    DPARAM = par[11];\\r\\n    EPARAM = par[12];\\r\\n    GXM = par[13];\\r\\n    GYM = par[14];\\r\\n    GZM = par[15];\\r\\n    AXM = par[16];\\r\\n    AYM = par[17];\\r\\n    AZM = par[18];\\r\\n    CONCM = par[19];\\r\\n    RKM2 = par[32];\\r\\n    DM = par[21];\\r\\n    DDM = par[22];\\r\\n    ACONTM = par[23];\\r\\n    AMOLFRAM2 = par[33];\\r\\n    THETAM = par[25];\\r\\n    PHIM = par[26];\\r\\n    FLAG = par[27];\\r\\n    Tref = par[28];\\r\\n    FN = par[29];\\r\\n\\r\\n    double TAURM, TAUVM, TAUMM2, af;\\r\\n\\r\\n    TAURM = TAURMref*exp(ERM*(1.0/N_1-1.0/Tref));\\r\\n    TAUVM = TAUVMref*exp(EVM*(1.0/N_1-1.0/Tref));\\r\\n    TAUMM2 = TAUMMref2*exp(EMM2*(1.0/N_1-1.0/Tref));    \\r\\n\\r\\n    af = FlorenceN(1.0,3.0,f, SI, GAMMAI, SPIN, 1.0, DELTA2, TAURM, TAUVM, TAUMM2, DPARAM, EPARAM, 0.0, GXM, GYM, GZM, AXM, AYM, AZM, DM, DDM, CONCM, 1.0, AMOLFRAM2, RKM2, ACONTM, THETAM, PHIM, FLAG) + FlorenceN(2.0,3.0,f, SI, GAMMAI, SPIN, 1.0, DELTA2, TAURM, TAUVM, TAUMM2, DPARAM, EPARAM, 0.0, GXM, GYM, GZM, AXM, AYM, AZM, DM, DDM, CONCM, 1.0, AMOLFRAM2, RKM2, ACONTM, THETAM, PHIM, FLAG) + FlorenceN(3.0,3.0,f, SI, GAMMAI, SPIN, 1.0, DELTA2, TAURM, TAUVM, TAUMM2, DPARAM, EPARAM, 0.0, GXM, GYM, GZM, AXM, AYM, AZM, DM, DDM, CONCM, 1.0, AMOLFRAM2, RKM2, ACONTM, THETAM, PHIM, FLAG);\\r\\n\\r\\n    return af;\\r\\n\\r\\n}\",\n");
                jsonBuilder.append("\"AuxDeclar\": \"double FlorenceN_fH(), FlorenceN_fH_SS()\",\n");
                break;
            case "FLORENCE+FREED+SS": // 6. Florence + Freed + SS
                jsonBuilder.append("\"Function\": \"R1= FlorenceN_fH(f, N, par) \\\\+ R1OSabh_hybrid(f, N, par) \\\\+ FlorenceN_fH_SS(f, N, par)\",\n");
                jsonBuilder.append("\"AuxCode\": \"#include <stdio.h>\\r\\n#include <math.h>\\r\\n#include <stdlib.h>\\r\\n#include <string.h>\\r\\n#include \\\"globals.h\\\"\\r\\n#include \\\"struct.h\\\"\\r\\n#include \\\"userlib.h\\\"\\r\\n#include \\\"ndata.h\\\"\\r\\n#include \\\"mixed.h\\\"\\r\\n\\r\\n#define pi 3.1415926\\r\\n\\r\\ndouble FlorenceN_fH(double f, double N, double *par);\\r\\ndouble FlorenceN_fH(double f, double N, double *par)\\r\\n{\\r\\n    double SI, GAMMAI, SPIN, DELTA2, TAURMref, TAUVMref, TAUMMref, ERM, EVM, EMM, DPARAM, EPARAM, GXM, GYM, GZM, AXM, AYM, AZM, CONCM, RKM, DM, DDM, ACONTM, AMOLFRAM, THETAM, PHIM, FLAG, Tref, FN;\\r\\n\\r\\n    SI = par[1];\\r\\n    GAMMAI = par[2];\\r\\n    SPIN = par[3];\\r\\n    DELTA2 = par[4];   \\r\\n    TAURMref = par[5];\\r\\n    TAUVMref = par[6];\\r\\n    TAUMMref = par[7];\\r\\n    ERM = par[8];\\r\\n    EVM = par[9];\\r\\n    EMM = par[10];\\r\\n    DPARAM = par[11];\\r\\n    EPARAM = par[12];\\r\\n    GXM = par[13];\\r\\n    GYM = par[14];\\r\\n    GZM = par[15];\\r\\n    AXM = par[16];\\r\\n    AYM = par[17];\\r\\n    AZM = par[18];\\r\\n    CONCM = par[19];\\r\\n    RKM = par[20];\\r\\n    DM = par[21];\\r\\n    DDM = par[22];\\r\\n    ACONTM = par[23];\\r\\n    AMOLFRAM = par[24];\\r\\n    THETAM = par[25];\\r\\n    PHIM = par[26];\\r\\n    FLAG = par[27];\\r\\n    Tref = par[28];\\r\\n    FN = par[29];\\r\\n\\r\\n    double TAURM, TAUVM, TAUMM, af;\\r\\n\\r\\n    TAURM = TAURMref*exp(ERM*(1.0/N_1-1.0/Tref));\\r\\n    TAUVM = TAUVMref*exp(EVM*(1.0/N_1-1.0/Tref));\\r\\n    TAUMM = TAUMMref*exp(EMM*(1.0/N_1-1.0/Tref));    \\r\\n\\r\\n    af = FlorenceN(1.0,3.0,f, SI, GAMMAI, SPIN, 1.0, DELTA2, TAURM, TAUVM, TAUMM, DPARAM, EPARAM, 0.0, GXM, GYM, GZM, AXM, AYM, AZM, DM, DDM, CONCM, 1.0, AMOLFRAM, RKM, ACONTM, THETAM, PHIM, FLAG) + FlorenceN(2.0,3.0,f, SI, GAMMAI, SPIN, 1.0, DELTA2, TAURM, TAUVM, TAUMM, DPARAM, EPARAM, 0.0, GXM, GYM, GZM, AXM, AYM, AZM, DM, DDM, CONCM, 1.0, AMOLFRAM, RKM, ACONTM, THETAM, PHIM, FLAG) + FlorenceN(3.0,3.0,f, SI, GAMMAI, SPIN, 1.0, DELTA2, TAURM, TAUVM, TAUMM, DPARAM, EPARAM, 0.0, GXM, GYM, GZM, AXM, AYM, AZM, DM, DDM, CONCM, 1.0, AMOLFRAM, RKM, ACONTM, THETAM, PHIM, FLAG);\\r\\n    \\r\\n    return af;\\r\\n     \\r\\n}\\r\\n\\r\\ndouble R1OSabh_hybrid(double f, double N, double *par);\\r\\ndouble R1OSabh_hybrid(double f, double N, double *par)\\r\\n{\\r\\n    double CONCM, SPIN, DM, DDM, TAUVMref, TAUVM, EVM, DELTA2, FN, af, Tref;\\r\\n\\r\\n    CONCM = par[19];\\r\\n    SPIN = par[3];\\r\\n    DM = par[21];\\r\\n    DDM = par[22];\\r\\n    TAUVMref = par[6];\\r\\n    EVM = par[9];\\r\\n    DELTA2 = par[4];\\r\\n    FN = par[29];\\r\\n    Tref = par[28];\\r\\n\\r\\n    TAUVM = TAUVMref*exp(EVM*(1.0/N_1-1.0/Tref));\\r\\n\\r\\n    af=R1OSabh(f, CONCM*1e3, SPIN, DM, DDM, TAUVM, pow(1.883636123e11*DELTA2, 2.0),FN);\\r\\n\\r\\n    return af;\\r\\n}\\r\\n\\r\\ndouble FlorenceN_fH_SS(double f, double N, double *par);\\r\\ndouble FlorenceN_fH_SS(double f, double N, double *par)\\r\\n{\\r\\n    double SI, GAMMAI, SPIN, DELTA2, TAURMref, TAUVMref, TAUMMref2, ERM, EVM, EMM2, DPARAM, EPARAM, GXM, GYM, GZM, AXM, AYM, AZM, CONCM, RKM2, ACONTM, AMOLFRAM2, THETAM, PHIM, FLAG, Tref, FN;\\r\\n\\r\\n    SI = par[1];\\r\\n    GAMMAI = par[2];\\r\\n    SPIN = par[3];\\r\\n    DELTA2 = par[4];   \\r\\n    TAURMref = par[5];\\r\\n    TAUVMref = par[6];\\r\\n    TAUMMref2 = par[30];\\r\\n    ERM = par[8];\\r\\n    EVM = par[9];\\r\\n    EMM2 = par[31];\\r\\n    DPARAM = par[11];\\r\\n    EPARAM = par[12];\\r\\n    GXM = par[13];\\r\\n    GYM = par[14];\\r\\n    GZM = par[15];\\r\\n    AXM = par[16];\\r\\n    AYM = par[17];\\r\\n    AZM = par[18];\\r\\n    CONCM = par[19];\\r\\n    RKM2 = par[32];\\r\\n    ACONTM = par[23];\\r\\n    AMOLFRAM2 = par[33];\\r\\n    THETAM = par[25];\\r\\n    PHIM = par[26];\\r\\n    FLAG = par[27];\\r\\n    Tref = par[28];\\r\\n    FN = par[29];\\r\\n\\r\\n    double TAURM, TAUVM, TAUMM2, af;\\r\\n\\r\\n    TAURM = TAURMref*exp(ERM*(1.0/N_1-1.0/Tref));\\r\\n    TAUVM = TAUVMref*exp(EVM*(1.0/N_1-1.0/Tref));\\r\\n    TAUMM2 = TAUMMref2*exp(EMM2*(1.0/N_1-1.0/Tref));    \\r\\n\\r\\n    af = FlorenceN(1.0,3.0,f, SI, GAMMAI, SPIN, 1.0, DELTA2, TAURM, TAUVM, TAUMM2, DPARAM, EPARAM, 0.0, GXM, GYM, GZM, AXM, AYM, AZM, 0.0, 0.0, CONCM, 1.0, AMOLFRAM2, RKM2, ACONTM, THETAM, PHIM, FLAG) + FlorenceN(2.0,3.0,f, SI, GAMMAI, SPIN, 1.0, DELTA2, TAURM, TAUVM, TAUMM2, DPARAM, EPARAM, 0.0, GXM, GYM, GZM, AXM, AYM, AZM, 0.0, 0.0, CONCM, 1.0, AMOLFRAM2, RKM2, ACONTM, THETAM, PHIM, FLAG) + FlorenceN(3.0,3.0,f, SI, GAMMAI, SPIN, 1.0, DELTA2, TAURM, TAUVM, TAUMM2, DPARAM, EPARAM, 0.0, GXM, GYM, GZM, AXM, AYM, AZM, 0.0, 0.0, CONCM, 1.0, AMOLFRAM2, RKM2, ACONTM, THETAM, PHIM, FLAG);\\r\\n\\r\\n    return af;\\r\\n\\r\\n}\",\n");
                jsonBuilder.append("\"AuxDeclar\": \"double FlorenceN_fH(), R1OSabh_hybrid(), FlorenceN_fH_SS()\",\n");
                break;
            case "FLORENCE+LS+FREED+SS": // 7. Florence + Lipari-Szabo + Freed + SS
                jsonBuilder.append("\"Function\": \"R1= FlorenceN4LS_fH(f, N, par) \\\\+ R1OSabh_hybrid(f, N, par) \\\\+ FlorenceN_fH_SS(f, N, par)\",\n");
                jsonBuilder.append("\"AuxCode\": \"#include <stdio.h>\\r\\n#include <math.h>\\r\\n#include <stdlib.h>\\r\\n#include <string.h>\\r\\n#include \\\"globals.h\\\"\\r\\n#include \\\"struct.h\\\"\\r\\n#include \\\"userlib.h\\\"\\r\\n#include \\\"ndata.h\\\"\\r\\n#include \\\"mixed.h\\\"\\r\\n\\r\\n#define pi 3.1415926\\r\\n\\r\\ndouble FlorenceN4LS_fH(double f, double N, double *par);\\r\\ndouble FlorenceN4LS_fH(double f, double N, double *par)\\r\\n{\\r\\n    double SI, GAMMAI, SPIN, DELTA2, TAURMref, TAUVMref, TAUMMref, ERM, EVM, EMM, DPARAM, EPARAM, GXM, GYM, GZM, AXM, AYM, AZM, CONCM, RKM, DM, DDM, ACONTM, AMOLFRAM, THETAM, PHIM, FLAG, SLS, TAULMref, ELM, Tref, FN;\\r\\n\\r\\n    SI = par[1];\\r\\n    GAMMAI = par[2];\\r\\n    SPIN = par[3];\\r\\n    DELTA2 = par[4];   \\r\\n    TAURMref = par[5];\\r\\n    TAUVMref = par[6];\\r\\n    TAUMMref = par[7];\\r\\n    ERM = par[8];\\r\\n    EVM = par[9];\\r\\n    EMM = par[10];\\r\\n    DPARAM = par[11];\\r\\n    EPARAM = par[12];\\r\\n    GXM = par[13];\\r\\n    GYM = par[14];\\r\\n    GZM = par[15];\\r\\n    AXM = par[16];\\r\\n    AYM = par[17];\\r\\n    AZM = par[18];\\r\\n    CONCM = par[19];\\r\\n    RKM = par[20];\\r\\n    DM = par[21];\\r\\n    DDM = par[22];\\r\\n    ACONTM = par[23];\\r\\n    AMOLFRAM = par[24];\\r\\n    THETAM = par[25];\\r\\n    PHIM = par[26];\\r\\n    FLAG = par[27];\\r\\n    Tref = par[28];\\r\\n    FN = par[29];\\r\\n    SLS = par[30];\\r\\n    TAULMref = par[31];\\r\\n    ELM = par[32];\\r\\n    \\r\\n\\r\\n\\r\\n    double TAURM, TAUVM, TAUMM, TAULM, af;\\r\\n\\r\\n    TAURM = TAURMref*exp(ERM*(1.0/N_1-1.0/Tref));\\r\\n    TAUVM = TAUVMref*exp(EVM*(1.0/N_1-1.0/Tref));\\r\\n    TAUMM = TAUMMref*exp(EMM*(1.0/N_1-1.0/Tref));    \\r\\n    TAULM = TAULMref*exp(ELM*(1.0/N_1-1.0/Tref));    \\r\\n\\r\\n    af = SLS*FlorenceN(1.0,3.0,f, SI, GAMMAI, SPIN, 1.0, DELTA2, TAURM, TAUVM, TAUMM, DPARAM, EPARAM, 0.0, GXM, GYM, GZM, AXM, AYM, AZM, 0.0, 0.0, CONCM, 1.0, AMOLFRAM, RKM, ACONTM, THETAM, PHIM, FLAG) + (1-SLS)*FlorenceN4LS(1.0,3.0,f, SI, GAMMAI, SPIN, 1.0, DELTA2, TAULM, TAUVM, TAUMM, DPARAM, EPARAM, 0.0, GXM, GYM, GZM, AXM, AYM, AZM, 0.0, 0.0, CONCM, 1.0, AMOLFRAM, RKM, ACONTM, THETAM, PHIM, FLAG) + SLS*FlorenceN(2.0,3.0,f, SI, GAMMAI, SPIN, 1.0, DELTA2, TAURM, TAUVM, TAUMM, DPARAM, EPARAM, 0.0, GXM, GYM, GZM, AXM, AYM, AZM, 0.0, 0.0, CONCM, 1.0, AMOLFRAM, RKM, ACONTM, THETAM, PHIM, FLAG) + (1-SLS)*FlorenceN4LS(2.0,3.0,f, SI, GAMMAI, SPIN, 1.0, DELTA2, TAULM, TAUVM, TAUMM, DPARAM, EPARAM, 0.0, GXM, GYM, GZM, AXM, AYM, AZM, 0.0, 0.0, CONCM, 1.0, AMOLFRAM, RKM, ACONTM, THETAM, PHIM, FLAG) + SLS*FlorenceN(3.0,3.0,f, SI, GAMMAI, SPIN, 1.0, DELTA2, TAURM, TAUVM, TAUMM, DPARAM, EPARAM, 0.0, GXM, GYM, GZM, AXM, AYM, AZM, 0.0, 0.0, CONCM, 1.0, AMOLFRAM, RKM, ACONTM, THETAM, PHIM, FLAG) + (1-SLS)*FlorenceN4LS(3.0,3.0,f, SI, GAMMAI, SPIN, 1.0, DELTA2, TAULM, TAUVM, TAUMM, DPARAM, EPARAM, 0.0, GXM, GYM, GZM, AXM, AYM, AZM, 0.0, 0.0, CONCM, 1.0, AMOLFRAM, RKM, ACONTM, THETAM, PHIM, FLAG);\\r\\n    \\r\\n    return af;\\r\\n     \\r\\n}\\r\\n\\r\\ndouble R1OSabh_hybrid(double f, double N, double *par);\\r\\ndouble R1OSabh_hybrid(double f, double N, double *par)\\r\\n{\\r\\n    double CONCM, SPIN, DM, DDM, TAUVMref,TAUVM, EVM, DELTA2, FN, Tref, af;\\r\\n\\r\\n    CONCM = par[19];\\r\\n    SPIN = par[3];\\r\\n    DM = par[21];\\r\\n    DDM = par[22];\\r\\n    TAUVMref = par[6];\\r\\n    EVM = par[9];\\r\\n    DELTA2 = par[4];\\r\\n    FN = par[29];\\r\\n    Tref = par[28];\\r\\n\\r\\n    TAUVM = TAUVMref*exp(EVM*(1.0/N_1-1.0/Tref));\\r\\n\\r\\n    af=R1OSabh(f, CONCM*1e3, SPIN, DM, DDM, TAUVM, pow(1.883636123e11*DELTA2, 2.0),FN);\\r\\n\\r\\n    return af;\\r\\n}\\r\\n\\r\\ndouble FlorenceN_fH_SS(double f, double N, double *par);\\r\\ndouble FlorenceN_fH_SS(double f, double N, double *par)\\r\\n{\\r\\n    double SI, GAMMAI, SPIN, DELTA2, TAURMref, TAUVMref, TAUMMref2, ERM, EVM, EMM2, DPARAM, EPARAM, GXM, GYM, GZM, AXM, AYM, AZM, CONCM, RKM2, ACONTM, AMOLFRAM2, THETAM, PHIM, FLAG, Tref, FN;\\r\\n\\r\\n    SI = par[1];\\r\\n    GAMMAI = par[2];\\r\\n    SPIN = par[3];\\r\\n    DELTA2 = par[4];   \\r\\n    TAURMref = par[5];\\r\\n    TAUVMref = par[6];\\r\\n    TAUMMref2 = par[33];\\r\\n    ERM = par[8];\\r\\n    EVM = par[9];\\r\\n    EMM2 = par[34];\\r\\n    DPARAM = par[11];\\r\\n    EPARAM = par[12];\\r\\n    GXM = par[13];\\r\\n    GYM = par[14];\\r\\n    GZM = par[15];\\r\\n    AXM = par[16];\\r\\n    AYM = par[17];\\r\\n    AZM = par[18];\\r\\n    CONCM = par[19];\\r\\n    RKM2 = par[35];\\r\\n    ACONTM = par[23];\\r\\n    AMOLFRAM2 = par[36];\\r\\n    THETAM = par[25];\\r\\n    PHIM = par[26];\\r\\n    FLAG = par[27];\\r\\n    Tref = par[28];\\r\\n    FN = par[29];\\r\\n\\r\\n    double TAURM, TAUVM, TAUMM2, af;\\r\\n\\r\\n    TAURM = TAURMref*exp(ERM*(1.0/N_1-1.0/Tref));\\r\\n    TAUVM = TAUVMref*exp(EVM*(1.0/N_1-1.0/Tref));\\r\\n    TAUMM2 = TAUMMref2*exp(EMM2*(1.0/N_1-1.0/Tref));    \\r\\n\\r\\n    af = FlorenceN(1.0,3.0,f, SI, GAMMAI, SPIN, 1.0, DELTA2, TAURM, TAUVM, TAUMM2, DPARAM, EPARAM, 0.0, GXM, GYM, GZM, AXM, AYM, AZM, 0.0, 0.0, CONCM, 1.0, AMOLFRAM2, RKM2, ACONTM, THETAM, PHIM, FLAG) + FlorenceN(2.0,3.0,f, SI, GAMMAI, SPIN, 1.0, DELTA2, TAURM, TAUVM, TAUMM2, DPARAM, EPARAM, 0.0, GXM, GYM, GZM, AXM, AYM, AZM, 0.0, 0.0, CONCM, 1.0, AMOLFRAM2, RKM2, ACONTM, THETAM, PHIM, FLAG) + FlorenceN(3.0,3.0,f, SI, GAMMAI, SPIN, 1.0, DELTA2, TAURM, TAUVM, TAUMM2, DPARAM, EPARAM, 0.0, GXM, GYM, GZM, AXM, AYM, AZM, 0.0, 0.0, CONCM, 1.0, AMOLFRAM2, RKM2, ACONTM, THETAM, PHIM, FLAG);\\r\\n\\r\\n    return af;\\r\\n\\r\\n}\",\n");
                jsonBuilder.append("\"AuxDeclar\": \"double FlorenceN4LS_fH(), R1OSabh_hybrid(), FlorenceN_fH_SS()\",\n");
                break;
            case "FLORENCE+LS+SS": // 8. Florence + Lipari-Szabo + SS
                jsonBuilder.append("\"Function\": \"R1= FlorenceN4LS_fH(f, N, par) \\\\+ R1OSabh_hybrid(f, N, par) \\\\+ FlorenceN_fH_SS(f, N, par)\",\n");
                jsonBuilder.append("\"AuxCode\": \"#include <stdio.h>\\r\\n#include <math.h>\\r\\n#include <stdlib.h>\\r\\n#include <string.h>\\r\\n#include \\\"globals.h\\\"\\r\\n#include \\\"struct.h\\\"\\r\\n#include \\\"userlib.h\\\"\\r\\n#include \\\"ndata.h\\\"\\r\\n#include \\\"mixed.h\\\"\\r\\n\\r\\n#define pi 3.1415926\\r\\n\\r\\ndouble FlorenceN4LS_fH(double f, double N, double *par);\\r\\ndouble FlorenceN4LS_fH(double f, double N, double *par)\\r\\n{\\r\\n    double SI, GAMMAI, SPIN, DELTA2, TAURMref, TAUVMref, TAUMMref, ERM, EVM, EMM, DPARAM, EPARAM, GXM, GYM, GZM, AXM, AYM, AZM, CONCM, RKM, DM, DDM, ACONTM, AMOLFRAM, THETAM, PHIM, FLAG, SLS, TAULMref, ELM, Tref, FN;\\r\\n\\r\\n    SI = par[1];\\r\\n    GAMMAI = par[2];\\r\\n    SPIN = par[3];\\r\\n    DELTA2 = par[4];   \\r\\n    TAURMref = par[5];\\r\\n    TAUVMref = par[6];\\r\\n    TAUMMref = par[7];\\r\\n    ERM = par[8];\\r\\n    EVM = par[9];\\r\\n    EMM = par[10];\\r\\n    DPARAM = par[11];\\r\\n    EPARAM = par[12];\\r\\n    GXM = par[13];\\r\\n    GYM = par[14];\\r\\n    GZM = par[15];\\r\\n    AXM = par[16];\\r\\n    AYM = par[17];\\r\\n    AZM = par[18];\\r\\n    CONCM = par[19];\\r\\n    RKM = par[20];\\r\\n    DM = par[21];\\r\\n    DDM = par[22];\\r\\n    ACONTM = par[23];\\r\\n    AMOLFRAM = par[24];\\r\\n    THETAM = par[25];\\r\\n    PHIM = par[26];\\r\\n    FLAG = par[27];\\r\\n    Tref = par[28];\\r\\n    FN = par[29];\\r\\n    SLS = par[30];\\r\\n    TAULMref = par[31];\\r\\n    ELM = par[32];\\r\\n    \\r\\n\\r\\n\\r\\n    double TAURM, TAUVM, TAUMM, TAULM, af;\\r\\n\\r\\n    TAURM = TAURMref*exp(ERM*(1.0/N_1-1.0/Tref));\\r\\n    TAUVM = TAUVMref*exp(EVM*(1.0/N_1-1.0/Tref));\\r\\n    TAUMM = TAUMMref*exp(EMM*(1.0/N_1-1.0/Tref));    \\r\\n    TAULM = TAULMref*exp(ELM*(1.0/N_1-1.0/Tref));    \\r\\n\\r\\n    af = SLS*FlorenceN(1.0,3.0,f, SI, GAMMAI, SPIN, 1.0, DELTA2, TAURM, TAUVM, TAUMM, DPARAM, EPARAM, 0.0, GXM, GYM, GZM, AXM, AYM, AZM, 0.0, 0.0, CONCM, 1.0, AMOLFRAM, RKM, ACONTM, THETAM, PHIM, FLAG) + (1-SLS)*FlorenceN4LS(1.0,3.0,f, SI, GAMMAI, SPIN, 1.0, DELTA2, TAULM, TAUVM, TAUMM, DPARAM, EPARAM, 0.0, GXM, GYM, GZM, AXM, AYM, AZM, 0.0, 0.0, CONCM, 1.0, AMOLFRAM, RKM, ACONTM, THETAM, PHIM, FLAG) + SLS*FlorenceN(2.0,3.0,f, SI, GAMMAI, SPIN, 1.0, DELTA2, TAURM, TAUVM, TAUMM, DPARAM, EPARAM, 0.0, GXM, GYM, GZM, AXM, AYM, AZM, 0.0, 0.0, CONCM, 1.0, AMOLFRAM, RKM, ACONTM, THETAM, PHIM, FLAG) + (1-SLS)*FlorenceN4LS(2.0,3.0,f, SI, GAMMAI, SPIN, 1.0, DELTA2, TAULM, TAUVM, TAUMM, DPARAM, EPARAM, 0.0, GXM, GYM, GZM, AXM, AYM, AZM, 0.0, 0.0, CONCM, 1.0, AMOLFRAM, RKM, ACONTM, THETAM, PHIM, FLAG) + SLS*FlorenceN(3.0,3.0,f, SI, GAMMAI, SPIN, 1.0, DELTA2, TAURM, TAUVM, TAUMM, DPARAM, EPARAM, 0.0, GXM, GYM, GZM, AXM, AYM, AZM, 0.0, 0.0, CONCM, 1.0, AMOLFRAM, RKM, ACONTM, THETAM, PHIM, FLAG) + (1-SLS)*FlorenceN4LS(3.0,3.0,f, SI, GAMMAI, SPIN, 1.0, DELTA2, TAULM, TAUVM, TAUMM, DPARAM, EPARAM, 0.0, GXM, GYM, GZM, AXM, AYM, AZM, 0.0, 0.0, CONCM, 1.0, AMOLFRAM, RKM, ACONTM, THETAM, PHIM, FLAG);\\r\\n    \\r\\n    return af;\\r\\n     \\r\\n}\\r\\n\\r\\ndouble R1OSabh_hybrid(double f, double N, double *par);\\r\\ndouble R1OSabh_hybrid(double f, double N, double *par)\\r\\n{\\r\\n    double CONCM, SPIN, DM, DDM, TAUVMref,TAUVM, EVM, DELTA2, FN, Tref, af;\\r\\n\\r\\n    CONCM = par[19];\\r\\n    SPIN = par[3];\\r\\n    DM = par[21];\\r\\n    DDM = par[22];\\r\\n    TAUVMref = par[6];\\r\\n    EVM = par[9];\\r\\n    DELTA2 = par[4];\\r\\n    FN = par[29];\\r\\n    Tref = par[28];\\r\\n\\r\\n    TAUVM = TAUVMref*exp(EVM*(1.0/N_1-1.0/Tref));\\r\\n\\r\\n    af=R1OSabh(f, CONCM*1e3, SPIN, DM, DDM, TAUVM, pow(1.883636123e11*DELTA2, 2.0),FN);\\r\\n\\r\\n    return af;\\r\\n}\\r\\n\\r\\ndouble FlorenceN_fH_SS(double f, double N, double *par);\\r\\ndouble FlorenceN_fH_SS(double f, double N, double *par)\\r\\n{\\r\\n    double SI, GAMMAI, SPIN, DELTA2, TAURMref, TAUVMref, TAUMMref2, ERM, EVM, EMM2, DPARAM, EPARAM, GXM, GYM, GZM, AXM, AYM, AZM, CONCM, RKM2, ACONTM, AMOLFRAM2, THETAM, PHIM, FLAG, Tref, FN;\\r\\n\\r\\n    SI = par[1];\\r\\n    GAMMAI = par[2];\\r\\n    SPIN = par[3];\\r\\n    DELTA2 = par[4];   \\r\\n    TAURMref = par[5];\\r\\n    TAUVMref = par[6];\\r\\n    TAUMMref2 = par[33];\\r\\n    ERM = par[8];\\r\\n    EVM = par[9];\\r\\n    EMM2 = par[34];\\r\\n    DPARAM = par[11];\\r\\n    EPARAM = par[12];\\r\\n    GXM = par[13];\\r\\n    GYM = par[14];\\r\\n    GZM = par[15];\\r\\n    AXM = par[16];\\r\\n    AYM = par[17];\\r\\n    AZM = par[18];\\r\\n    CONCM = par[19];\\r\\n    RKM2 = par[35];\\r\\n    ACONTM = par[23];\\r\\n    AMOLFRAM2 = par[36];\\r\\n    THETAM = par[25];\\r\\n    PHIM = par[26];\\r\\n    FLAG = par[27];\\r\\n    Tref = par[28];\\r\\n    FN = par[29];\\r\\n\\r\\n    double TAURM, TAUVM, TAUMM2, af;\\r\\n\\r\\n    TAURM = TAURMref*exp(ERM*(1.0/N_1-1.0/Tref));\\r\\n    TAUVM = TAUVMref*exp(EVM*(1.0/N_1-1.0/Tref));\\r\\n    TAUMM2 = TAUMMref2*exp(EMM2*(1.0/N_1-1.0/Tref));    \\r\\n\\r\\n    af = FlorenceN(1.0,3.0,f, SI, GAMMAI, SPIN, 1.0, DELTA2, TAURM, TAUVM, TAUMM2, DPARAM, EPARAM, 0.0, GXM, GYM, GZM, AXM, AYM, AZM, 0.0, 0.0, CONCM, 1.0, AMOLFRAM2, RKM2, ACONTM, THETAM, PHIM, FLAG) + FlorenceN(2.0,3.0,f, SI, GAMMAI, SPIN, 1.0, DELTA2, TAURM, TAUVM, TAUMM2, DPARAM, EPARAM, 0.0, GXM, GYM, GZM, AXM, AYM, AZM, 0.0, 0.0, CONCM, 1.0, AMOLFRAM2, RKM2, ACONTM, THETAM, PHIM, FLAG) + FlorenceN(3.0,3.0,f, SI, GAMMAI, SPIN, 1.0, DELTA2, TAURM, TAUVM, TAUMM2, DPARAM, EPARAM, 0.0, GXM, GYM, GZM, AXM, AYM, AZM, 0.0, 0.0, CONCM, 1.0, AMOLFRAM2, RKM2, ACONTM, THETAM, PHIM, FLAG);\\r\\n\\r\\n    return af;\\r\\n\\r\\n}\",\n");
                jsonBuilder.append("\"AuxDeclar\": \"double FlorenceN4LS_fH(), FlorenceN_fH_SS()\",\n");
                break;
            case "FLORENCE+FREED+DDISCRETE": // 9. Florence + Freed (D discrete)
                jsonBuilder.append("\"Function\": \"R1= FlorenceN_fHD(f, N, par) \\\\+ R1OSabh_fHD(f, N, par)\",\n");
                jsonBuilder.append("\"AuxCode\": \"#include <stdio.h>\\r\\n#include <math.h>\\r\\n#include <stdlib.h>\\r\\n#include <string.h>\\r\\n#include \\\"globals.h\\\"\\r\\n#include \\\"struct.h\\\"\\r\\n#include \\\"userlib.h\\\"\\r\\n#include \\\"ndata.h\\\"\\r\\n#include \\\"mixed.h\\\"\\r\\n\\r\\n#define pi 3.1415926\\r\\n\\r\\ndouble FlorenceN_fHD(double f, double N, double *par);\\r\\ndouble FlorenceN_fHD(double f, double N, double *par)\\r\\n{\\r\\n    double SI, GAMMAI, SPIN, DELTA2, TAURMref, TAUVMref, TAUMMref, ERM, EVM, EMM, DPARAM, EPARAM, GXM, GYM, GZM, AXM, AYM, AZM, CONCM, RKM, DM, DDM, ACONTM, AMOLFRAM, THETAM, PHIM, FLAG, Tref;\\r\\n\\r\\n    SI = par[1];\\r\\n    GAMMAI = par[2];\\r\\n    SPIN = par[3];\\r\\n    DELTA2 = par[4];   \\r\\n    TAURMref = par[5];\\r\\n    TAUVMref = par[6];\\r\\n    TAUMMref = par[7];\\r\\n    ERM = par[8];\\r\\n    EVM = par[9];\\r\\n    EMM = par[10];\\r\\n    DPARAM = par[11];\\r\\n    EPARAM = par[12];\\r\\n    GXM = par[13];\\r\\n    GYM = par[14];\\r\\n    GZM = par[15];\\r\\n    AXM = par[16];\\r\\n    AYM = par[17];\\r\\n    AZM = par[18];\\r\\n    CONCM = par[19];\\r\\n    RKM = par[20];\\r\\n    DM = par[21];\\r\\n    DDM = N_3;\\r\\n    ACONTM = par[22];\\r\\n    AMOLFRAM = par[23];\\r\\n    THETAM = par[24];\\r\\n    PHIM = par[25];\\r\\n    FLAG = par[26];\\r\\n    Tref = par[27];\\r\\n\\r\\n    double TAURM, TAUVM, TAUMM, af;\\r\\n\\r\\n    TAURM = TAURMref*exp(ERM*(1.0/N_1-1.0/Tref));\\r\\n    TAUVM = TAUVMref*exp(EVM*(1.0/N_1-1.0/Tref));\\r\\n    TAUMM = TAUMMref*exp(EMM*(1.0/N_1-1.0/Tref));    \\r\\n\\r\\n    af = FlorenceN(1.0,3.0,f, SI, GAMMAI, SPIN, 1.0, DELTA2, TAURM, TAUVM, TAUMM, DPARAM, EPARAM, 0.0, GXM, GYM, GZM, AXM, AYM, AZM, DM, DDM, CONCM, 1.0, AMOLFRAM, RKM, ACONTM, THETAM, PHIM, FLAG) + FlorenceN(2.0,3.0,f, SI, GAMMAI, SPIN, 1.0, DELTA2, TAURM, TAUVM, TAUMM, DPARAM, EPARAM, 0.0, GXM, GYM, GZM, AXM, AYM, AZM, DM, DDM, CONCM, 1.0, AMOLFRAM, RKM, ACONTM, THETAM, PHIM, FLAG) + FlorenceN(3.0,3.0,f, SI, GAMMAI, SPIN, 1.0, DELTA2, TAURM, TAUVM, TAUMM, DPARAM, EPARAM, 0.0, GXM, GYM, GZM, AXM, AYM, AZM, DM, DDM, CONCM, 1.0, AMOLFRAM, RKM, ACONTM, THETAM, PHIM, FLAG);\\r\\n    \\r\\n    return af;\\r\\n     \\r\\n}\\r\\n\\r\\ndouble R1OSabh_fHD(double f, double N, double *par);\\r\\ndouble R1OSabh_fHD(double f, double N, double *par)\\r\\n{\\r\\n    double CONCM, SPIN, DM, DDM, TAUVMref, TAUVM, EVM, DELTA2, FN, af, Tref;\\r\\n\\r\\n    CONCM = par[19];\\r\\n    SPIN = par[3];\\r\\n    DM = par[21];\\r\\n    DDM = N_3;\\r\\n    TAUVMref = par[6];\\r\\n    EVM = par[9];\\r\\n    DELTA2 = par[4];\\r\\n    FN = par[28];\\r\\n    Tref = par[27];\\r\\n\\r\\n    TAUVM = TAUVMref*exp(EVM*(1.0/N_1-1.0/Tref));\\r\\n\\r\\n    af=R1OSabh(f, CONCM*1e3, SPIN, DM, DDM, TAUVM, pow(1.883636123e11*DELTA2, 2.0),FN);\\r\\n\\r\\n    return af;\\r\\n}\",\n");
                jsonBuilder.append("\"AuxDeclar\": \"double FlorenceN_fHD(), R1OSabh_fHD()\",\n");
                break;
            case "FLORENCE+LS+FREED+DDISCRETE": // 10. Florence + Lipari-Szabo + Freed (D discrete)
                jsonBuilder.append("\"Function\": \"R1= FlorenceN4LS_fHD(f, N, par) \\\\+ R1OSabh_fHD(f, N, par)\",\n");
                jsonBuilder.append("\"AuxCode\": \"#include <stdio.h>\\r\\n#include <math.h>\\r\\n#include <stdlib.h>\\r\\n#include <string.h>\\r\\n#include \\\"globals.h\\\"\\r\\n#include \\\"struct.h\\\"\\r\\n#include \\\"userlib.h\\\"\\r\\n#include \\\"ndata.h\\\"\\r\\n#include \\\"mixed.h\\\"\\r\\n\\r\\n#define pi 3.1415926\\r\\n\\r\\ndouble FlorenceN4LS_fHD(double f, double N, double *par);\\r\\ndouble FlorenceN4LS_fHD(double f, double N, double *par)\\r\\n{\\r\\n    double SI, GAMMAI, SPIN, DELTA2, TAURMref, TAUVMref, TAUMMref, ERM, EVM, EMM, DPARAM, EPARAM, GXM, GYM, GZM, AXM, AYM, AZM, CONCM, RKM, DM, DDM, ACONTM, AMOLFRAM, THETAM, PHIM, FLAG, SLS, TAULMref, ELM, Tref, FN;\\r\\n\\r\\n    SI = par[1];\\r\\n    GAMMAI = par[2];\\r\\n    SPIN = par[3];\\r\\n    DELTA2 = par[4];   \\r\\n    TAURMref = par[5];\\r\\n    TAUVMref = par[6];\\r\\n    TAUMMref = par[7];\\r\\n    ERM = par[8];\\r\\n    EVM = par[9];\\r\\n    EMM = par[10];\\r\\n    DPARAM = par[11];\\r\\n    EPARAM = par[12];\\r\\n    GXM = par[13];\\r\\n    GYM = par[14];\\r\\n    GZM = par[15];\\r\\n    AXM = par[16];\\r\\n    AYM = par[17];\\r\\n    AZM = par[18];\\r\\n    CONCM = par[19];\\r\\n    RKM = par[20];\\r\\n    DM = par[21];\\r\\n    DDM = N_3;\\r\\n    ACONTM = par[22];\\r\\n    AMOLFRAM = par[23];\\r\\n    THETAM = par[24];\\r\\n    PHIM = par[25];\\r\\n    FLAG = par[26];\\r\\n    SLS = par[27];\\r\\n    TAULMref = par[28];\\r\\n    ELM = par[29];\\r\\n    Tref = par[30];\\r\\n    FN = par[31];\\r\\n\\r\\n    double TAURM, TAUVM, TAUMM, TAULM, af;\\r\\n\\r\\n    TAURM = TAURMref*exp(ERM*(1.0/N_1-1.0/Tref));\\r\\n    TAUVM = TAUVMref*exp(EVM*(1.0/N_1-1.0/Tref));\\r\\n    TAUMM = TAUMMref*exp(EMM*(1.0/N_1-1.0/Tref));    \\r\\n    TAULM = TAULMref*exp(ELM*(1.0/N_1-1.0/Tref));    \\r\\n\\r\\n    af = SLS*FlorenceN(1.0,3.0,f, SI, GAMMAI, SPIN, 1.0, DELTA2, TAURM, TAUVM, TAUMM, DPARAM, EPARAM, 0.0, GXM, GYM, GZM, AXM, AYM, AZM, 0.0, 0.0, CONCM, 1.0, AMOLFRAM, RKM, ACONTM, THETAM, PHIM, FLAG) + (1-SLS)*FlorenceN4LS(1.0,3.0,f, SI, GAMMAI, SPIN, 1.0, DELTA2, TAULM, TAUVM, TAUMM, DPARAM, EPARAM, 0.0, GXM, GYM, GZM, AXM, AYM, AZM, 0.0, 0.0, CONCM, 1.0, AMOLFRAM, RKM, ACONTM, THETAM, PHIM, FLAG) + SLS*FlorenceN(2.0,3.0,f, SI, GAMMAI, SPIN, 1.0, DELTA2, TAURM, TAUVM, TAUMM, DPARAM, EPARAM, 0.0, GXM, GYM, GZM, AXM, AYM, AZM, 0.0, 0.0, CONCM, 1.0, AMOLFRAM, RKM, ACONTM, THETAM, PHIM, FLAG) + (1-SLS)*FlorenceN4LS(2.0,3.0,f, SI, GAMMAI, SPIN, 1.0, DELTA2, TAULM, TAUVM, TAUMM, DPARAM, EPARAM, 0.0, GXM, GYM, GZM, AXM, AYM, AZM, 0.0, 0.0, CONCM, 1.0, AMOLFRAM, RKM, ACONTM, THETAM, PHIM, FLAG) + SLS*FlorenceN(3.0,3.0,f, SI, GAMMAI, SPIN, 1.0, DELTA2, TAURM, TAUVM, TAUMM, DPARAM, EPARAM, 0.0, GXM, GYM, GZM, AXM, AYM, AZM, 0.0, 0.0, CONCM, 1.0, AMOLFRAM, RKM, ACONTM, THETAM, PHIM, FLAG) + (1-SLS)*FlorenceN4LS(3.0,3.0,f, SI, GAMMAI, SPIN, 1.0, DELTA2, TAULM, TAUVM, TAUMM, DPARAM, EPARAM, 0.0, GXM, GYM, GZM, AXM, AYM, AZM, 0.0, 0.0, CONCM, 1.0, AMOLFRAM, RKM, ACONTM, THETAM, PHIM, FLAG);\\r\\n    \\r\\n    return af;\\r\\n     \\r\\n}\\r\\n\\r\\ndouble R1OSabh_fHD(double f, double N, double *par);\\r\\ndouble R1OSabh_fHD(double f, double N, double *par)\\r\\n{\\r\\n    double CONCM, SPIN, DM, DDM, TAUVMref, TAUVM, EVM, DELTA2, FN, Tref, af;\\r\\n\\r\\n    CONCM = par[19];\\r\\n    SPIN = par[3];\\r\\n    DM = par[21];\\r\\n    DDM = N_3;\\r\\n    TAUVMref = par[6];\\r\\n    EVM = par[9];\\r\\n    DELTA2 = par[4];\\r\\n    FN = par[31];\\r\\n    Tref = par[30];\\r\\n\\r\\n    TAUVM = TAUVMref*exp(EVM*(1.0/N_1-1.0/Tref));\\r\\n\\r\\n    af=R1OSabh(f, CONCM*1e3, SPIN, DM, DDM, TAUVM, pow(1.883636123e11*DELTA2, 2.0),FN);\\r\\n\\r\\n    return af;\\r\\n}\",\n");
                jsonBuilder.append("\"AuxDeclar\": \"double FlorenceN4LS_fHD(), R1OSabh_fHD()\",\n");
                break;
            case "FLORENCE+LS+FREED+SS+DDISCRETE": // 11. Florence + Lipari-Szabo + Freed + SS (D discrete)
                jsonBuilder.append("\"Function\": \"R1= FlorenceN4LS_fHD(f, N, par) \\\\+ R1OSabh_fHD(f, N, par) \\\\+ FlorenceN_fHD_SS(f, N, par)\",\n");
                jsonBuilder.append("\"AuxCode\": \"#include <stdio.h>\\r\\n#include <math.h>\\r\\n#include <stdlib.h>\\r\\n#include <string.h>\\r\\n#include \\\"globals.h\\\"\\r\\n#include \\\"struct.h\\\"\\r\\n#include \\\"userlib.h\\\"\\r\\n#include \\\"ndata.h\\\"\\r\\n#include \\\"mixed.h\\\"\\r\\n\\r\\n#define pi 3.1415926\\r\\n\\r\\ndouble FlorenceN4LS_fHD(double f, double N, double *par);\\r\\ndouble FlorenceN4LS_fHD(double f, double N, double *par)\\r\\n{\\r\\n    double SI, GAMMAI, SPIN, DELTA2, TAURMref, TAUVMref, TAUMMref, ERM, EVM, EMM, DPARAM, EPARAM, GXM, GYM, GZM, AXM, AYM, AZM, CONCM, RKM, DM, DDM, ACONTM, AMOLFRAM, THETAM, PHIM, FLAG, SLS, TAULMref, ELM, Tref, FN;\\r\\n\\r\\n    SI = par[1];\\r\\n    GAMMAI = par[2];\\r\\n    SPIN = par[3];\\r\\n    DELTA2 = par[4];   \\r\\n    TAURMref = par[5];\\r\\n    TAUVMref = par[6];\\r\\n    TAUMMref = par[7];\\r\\n    ERM = par[8];\\r\\n    EVM = par[9];\\r\\n    EMM = par[10];\\r\\n    DPARAM = par[11];\\r\\n    EPARAM = par[12];\\r\\n    GXM = par[13];\\r\\n    GYM = par[14];\\r\\n    GZM = par[15];\\r\\n    AXM = par[16];\\r\\n    AYM = par[17];\\r\\n    AZM = par[18];\\r\\n    CONCM = par[19];\\r\\n    RKM = par[20];\\r\\n    DM = par[21];\\r\\n    DDM = N_3;\\r\\n    ACONTM = par[22];\\r\\n    AMOLFRAM = par[23];\\r\\n    THETAM = par[24];\\r\\n    PHIM = par[25];\\r\\n    FLAG = par[26];\\r\\n    Tref = par[27];\\r\\n    FN = par[28];\\r\\n    SLS = par[29];\\r\\n    TAULMref = par[30];\\r\\n    ELM = par[31];\\r\\n    \\r\\n\\r\\n\\r\\n    double TAURM, TAUVM, TAUMM, TAULM, af;\\r\\n\\r\\n    TAURM = TAURMref*exp(ERM*(1.0/N_1-1.0/Tref));\\r\\n    TAUVM = TAUVMref*exp(EVM*(1.0/N_1-1.0/Tref));\\r\\n    TAUMM = TAUMMref*exp(EMM*(1.0/N_1-1.0/Tref));    \\r\\n    TAULM = TAULMref*exp(ELM*(1.0/N_1-1.0/Tref));    \\r\\n\\r\\n    af = SLS*FlorenceN(1.0,3.0,f, SI, GAMMAI, SPIN, 1.0, DELTA2, TAURM, TAUVM, TAUMM, DPARAM, EPARAM, 0.0, GXM, GYM, GZM, AXM, AYM, AZM, 0.0, 0.0, CONCM, 1.0, AMOLFRAM, RKM, ACONTM, THETAM, PHIM, FLAG) + (1-SLS)*FlorenceN4LS(1.0,3.0,f, SI, GAMMAI, SPIN, 1.0, DELTA2, TAULM, TAUVM, TAUMM, DPARAM, EPARAM, 0.0, GXM, GYM, GZM, AXM, AYM, AZM, 0.0, 0.0, CONCM, 1.0, AMOLFRAM, RKM, ACONTM, THETAM, PHIM, FLAG) + SLS*FlorenceN(2.0,3.0,f, SI, GAMMAI, SPIN, 1.0, DELTA2, TAURM, TAUVM, TAUMM, DPARAM, EPARAM, 0.0, GXM, GYM, GZM, AXM, AYM, AZM, 0.0, 0.0, CONCM, 1.0, AMOLFRAM, RKM, ACONTM, THETAM, PHIM, FLAG) + (1-SLS)*FlorenceN4LS(2.0,3.0,f, SI, GAMMAI, SPIN, 1.0, DELTA2, TAULM, TAUVM, TAUMM, DPARAM, EPARAM, 0.0, GXM, GYM, GZM, AXM, AYM, AZM, 0.0, 0.0, CONCM, 1.0, AMOLFRAM, RKM, ACONTM, THETAM, PHIM, FLAG) + SLS*FlorenceN(3.0,3.0,f, SI, GAMMAI, SPIN, 1.0, DELTA2, TAURM, TAUVM, TAUMM, DPARAM, EPARAM, 0.0, GXM, GYM, GZM, AXM, AYM, AZM, 0.0, 0.0, CONCM, 1.0, AMOLFRAM, RKM, ACONTM, THETAM, PHIM, FLAG) + (1-SLS)*FlorenceN4LS(3.0,3.0,f, SI, GAMMAI, SPIN, 1.0, DELTA2, TAULM, TAUVM, TAUMM, DPARAM, EPARAM, 0.0, GXM, GYM, GZM, AXM, AYM, AZM, 0.0, 0.0, CONCM, 1.0, AMOLFRAM, RKM, ACONTM, THETAM, PHIM, FLAG);\\r\\n    \\r\\n    return af;\\r\\n     \\r\\n}\\r\\n\\r\\ndouble R1OSabh_fHD(double f, double N, double *par);\\r\\ndouble R1OSabh_fHD(double f, double N, double *par)\\r\\n{\\r\\n    double CONCM, SPIN, DM, DDM, TAUVMref,TAUVM, EVM, DELTA2, FN, Tref, af;\\r\\n\\r\\n    CONCM = par[19];\\r\\n    SPIN = par[3];\\r\\n    DM = par[21];\\r\\n    DDM = N_3;\\r\\n    TAUVMref = par[6];\\r\\n    EVM = par[9];\\r\\n    DELTA2 = par[4];\\r\\n    FN = par[28];\\r\\n    Tref = par[27];\\r\\n\\r\\n    TAUVM = TAUVMref*exp(EVM*(1.0/N_1-1.0/Tref));\\r\\n\\r\\n    af=R1OSabh(f, CONCM*1e3, SPIN, DM, DDM, TAUVM, pow(1.883636123e11*DELTA2, 2.0),FN);\\r\\n\\r\\n    return af;\\r\\n}\\r\\n\\r\\ndouble FlorenceN_fHD_SS(double f, double N, double *par);\\r\\ndouble FlorenceN_fHD_SS(double f, double N, double *par)\\r\\n{\\r\\n    double SI, GAMMAI, SPIN, DELTA2, TAURMref, TAUVMref, TAUMMref2, ERM, EVM, EMM2, DPARAM, EPARAM, GXM, GYM, GZM, AXM, AYM, AZM, CONCM, RKM2, ACONTM, AMOLFRAM2, THETAM, PHIM, FLAG, Tref, FN;\\r\\n\\r\\n    SI = par[1];\\r\\n    GAMMAI = par[2];\\r\\n    SPIN = par[3];\\r\\n    DELTA2 = par[4];   \\r\\n    TAURMref = par[5];\\r\\n    TAUVMref = par[6];\\r\\n    TAUMMref2 = par[32];\\r\\n    ERM = par[8];\\r\\n    EVM = par[9];\\r\\n    EMM2 = par[33];\\r\\n    DPARAM = par[11];\\r\\n    EPARAM = par[12];\\r\\n    GXM = par[13];\\r\\n    GYM = par[14];\\r\\n    GZM = par[15];\\r\\n    AXM = par[16];\\r\\n    AYM = par[17];\\r\\n    AZM = par[18];\\r\\n    CONCM = par[19];\\r\\n    RKM2 = par[34];\\r\\n    ACONTM = par[22];\\r\\n    AMOLFRAM2 = par[35];\\r\\n    THETAM = par[24];\\r\\n    PHIM = par[25];\\r\\n    FLAG = par[26];\\r\\n    Tref = par[27];\\r\\n    FN = par[28];\\r\\n\\r\\n    double TAURM, TAUVM, TAUMM2, af;\\r\\n\\r\\n    TAURM = TAURMref*exp(ERM*(1.0/N_1-1.0/Tref));\\r\\n    TAUVM = TAUVMref*exp(EVM*(1.0/N_1-1.0/Tref));\\r\\n    TAUMM2 = TAUMMref2*exp(EMM2*(1.0/N_1-1.0/Tref));    \\r\\n\\r\\n    af = FlorenceN(1.0,3.0,f, SI, GAMMAI, SPIN, 1.0, DELTA2, TAURM, TAUVM, TAUMM2, DPARAM, EPARAM, 0.0, GXM, GYM, GZM, AXM, AYM, AZM, 0.0, 0.0, CONCM, 1.0, AMOLFRAM2, RKM2, ACONTM, THETAM, PHIM, FLAG) + FlorenceN(2.0,3.0,f, SI, GAMMAI, SPIN, 1.0, DELTA2, TAURM, TAUVM, TAUMM2, DPARAM, EPARAM, 0.0, GXM, GYM, GZM, AXM, AYM, AZM, 0.0, 0.0, CONCM, 1.0, AMOLFRAM2, RKM2, ACONTM, THETAM, PHIM, FLAG) + FlorenceN(3.0,3.0,f, SI, GAMMAI, SPIN, 1.0, DELTA2, TAURM, TAUVM, TAUMM2, DPARAM, EPARAM, 0.0, GXM, GYM, GZM, AXM, AYM, AZM, 0.0, 0.0, CONCM, 1.0, AMOLFRAM2, RKM2, ACONTM, THETAM, PHIM, FLAG);\\r\\n\\r\\n    return af;\\r\\n\\r\\n}\",\n");
                jsonBuilder.append("\"AuxDeclar\": \"double FlorenceN4LS_fHD(), R1OSabh_fHD(), FlorenceN_fHD_SS()\",\n");
                break;
            case "FLORENCE+FREED+SS+DDISCRETE": // 12. Florence + Freed + SS (D discrete) -- not in your list
                jsonBuilder.append("\"Function\": \"R1= FlorenceN_fHD(f, N, par) \\\\+ R1OSabh_fHD(f, N, par) \\\\+ FlorenceN_fHD_SS(f, N, par)\",\n");
                jsonBuilder.append("\"AuxCode\": \"#include <stdio.h>\\r\\n#include <math.h>\\r\\n#include <stdlib.h>\\r\\n#include <string.h>\\r\\n#include \\\"globals.h\\\"\\r\\n#include \\\"struct.h\\\"\\r\\n#include \\\"userlib.h\\\"\\r\\n#include \\\"ndata.h\\\"\\r\\n#include \\\"mixed.h\\\"\\r\\n\\r\\n#define pi 3.1415926\\r\\n\\r\\ndouble FlorenceN_fHD(double f, double N, double *par);\\r\\ndouble FlorenceN_fHD(double f, double N, double *par)\\r\\n{\\r\\n    double SI, GAMMAI, SPIN, DELTA2, TAURMref, TAUVMref, TAUMMref, ERM, EVM, EMM, DPARAM, EPARAM, GXM, GYM, GZM, AXM, AYM, AZM, CONCM, RKM, DM, DDM, ACONTM, AMOLFRAM, THETAM, PHIM, FLAG, Tref, FN;\\r\\n\\r\\n    SI = par[1];\\r\\n    GAMMAI = par[2];\\r\\n    SPIN = par[3];\\r\\n    DELTA2 = par[4];   \\r\\n    TAURMref = par[5];\\r\\n    TAUVMref = par[6];\\r\\n    TAUMMref = par[7];\\r\\n    ERM = par[8];\\r\\n    EVM = par[9];\\r\\n    EMM = par[10];\\r\\n    DPARAM = par[11];\\r\\n    EPARAM = par[12];\\r\\n    GXM = par[13];\\r\\n    GYM = par[14];\\r\\n    GZM = par[15];\\r\\n    AXM = par[16];\\r\\n    AYM = par[17];\\r\\n    AZM = par[18];\\r\\n    CONCM = par[19];\\r\\n    RKM = par[20];\\r\\n    DM = par[21];\\r\\n    DDM = N_3;\\r\\n    ACONTM = par[22];\\r\\n    AMOLFRAM = par[23];\\r\\n    THETAM = par[24];\\r\\n    PHIM = par[25];\\r\\n    FLAG = par[26];\\r\\n    Tref = par[27];\\r\\n    FN = par[28];\\r\\n\\r\\n    double TAURM, TAUVM, TAUMM, af;\\r\\n\\r\\n    TAURM = TAURMref*exp(ERM*(1.0/N_1-1.0/Tref));\\r\\n    TAUVM = TAUVMref*exp(EVM*(1.0/N_1-1.0/Tref));\\r\\n    TAUMM = TAUMMref*exp(EMM*(1.0/N_1-1.0/Tref));    \\r\\n\\r\\n    af = FlorenceN(1.0,3.0,f, SI, GAMMAI, SPIN, 1.0, DELTA2, TAURM, TAUVM, TAUMM, DPARAM, EPARAM, 0.0, GXM, GYM, GZM, AXM, AYM, AZM, DM, DDM, CONCM, 1.0, AMOLFRAM, RKM, ACONTM, THETAM, PHIM, FLAG) + FlorenceN(2.0,3.0,f, SI, GAMMAI, SPIN, 1.0, DELTA2, TAURM, TAUVM, TAUMM, DPARAM, EPARAM, 0.0, GXM, GYM, GZM, AXM, AYM, AZM, DM, DDM, CONCM, 1.0, AMOLFRAM, RKM, ACONTM, THETAM, PHIM, FLAG) + FlorenceN(3.0,3.0,f, SI, GAMMAI, SPIN, 1.0, DELTA2, TAURM, TAUVM, TAUMM, DPARAM, EPARAM, 0.0, GXM, GYM, GZM, AXM, AYM, AZM, DM, DDM, CONCM, 1.0, AMOLFRAM, RKM, ACONTM, THETAM, PHIM, FLAG);\\r\\n    \\r\\n    return af;\\r\\n     \\r\\n}\\r\\n\\r\\ndouble R1OSabh_fHD(double f, double N, double *par);\\r\\ndouble R1OSabh_fHD(double f, double N, double *par)\\r\\n{\\r\\n    double CONCM, SPIN, DM, DDM, TAUVMref, TAUVM, EVM, DELTA2, FN, af, Tref;\\r\\n\\r\\n    CONCM = par[19];\\r\\n    SPIN = par[3];\\r\\n    DM = par[21];\\r\\n    DDM = N_3;\\r\\n    TAUVMref = par[6];\\r\\n    EVM = par[9];\\r\\n    DELTA2 = par[4];\\r\\n    FN = par[28];\\r\\n    Tref = par[27];\\r\\n\\r\\n    TAUVM = TAUVMref*exp(EVM*(1.0/N_1-1.0/Tref));\\r\\n\\r\\n    af=R1OSabh(f, CONCM*1e3, SPIN, DM, DDM, TAUVM, pow(1.883636123e11*DELTA2, 2.0),FN);\\r\\n\\r\\n    return af;\\r\\n}\\r\\n\\r\\ndouble FlorenceN_fHD_SS(double f, double N, double *par);\\r\\ndouble FlorenceN_fHD_SS(double f, double N, double *par)\\r\\n{\\r\\n    double SI, GAMMAI, SPIN, DELTA2, TAURMref, TAUVMref, TAUMMref2, ERM, EVM, EMM2, DPARAM, EPARAM, GXM, GYM, GZM, AXM, AYM, AZM, CONCM, RKM2, ACONTM, AMOLFRAM2, THETAM, PHIM, FLAG, Tref, FN;\\r\\n\\r\\n    SI = par[1];\\r\\n    GAMMAI = par[2];\\r\\n    SPIN = par[3];\\r\\n    DELTA2 = par[4];   \\r\\n    TAURMref = par[5];\\r\\n    TAUVMref = par[6];\\r\\n    TAUMMref2 = par[29];\\r\\n    ERM = par[8];\\r\\n    EVM = par[9];\\r\\n    EMM2 = par[30];\\r\\n    DPARAM = par[11];\\r\\n    EPARAM = par[12];\\r\\n    GXM = par[13];\\r\\n    GYM = par[14];\\r\\n    GZM = par[15];\\r\\n    AXM = par[16];\\r\\n    AYM = par[17];\\r\\n    AZM = par[18];\\r\\n    CONCM = par[19];\\r\\n    RKM2 = par[31];\\r\\n    ACONTM = par[22];\\r\\n    AMOLFRAM2 = par[32];\\r\\n    THETAM = par[24];\\r\\n    PHIM = par[25];\\r\\n    FLAG = par[26];\\r\\n    Tref = par[27];\\r\\n    FN = par[28];\\r\\n\\r\\n    double TAURM, TAUVM, TAUMM2, af;\\r\\n\\r\\n    TAURM = TAURMref*exp(ERM*(1.0/N_1-1.0/Tref));\\r\\n    TAUVM = TAUVMref*exp(EVM*(1.0/N_1-1.0/Tref));\\r\\n    TAUMM2 = TAUMMref2*exp(EMM2*(1.0/N_1-1.0/Tref));    \\r\\n\\r\\n    af = FlorenceN(1.0,3.0,f, SI, GAMMAI, SPIN, 1.0, DELTA2, TAURM, TAUVM, TAUMM2, DPARAM, EPARAM, 0.0, GXM, GYM, GZM, AXM, AYM, AZM, 0.0, 0.0, CONCM, 1.0, AMOLFRAM2, RKM2, ACONTM, THETAM, PHIM, FLAG) + FlorenceN(2.0,3.0,f, SI, GAMMAI, SPIN, 1.0, DELTA2, TAURM, TAUVM, TAUMM2, DPARAM, EPARAM, 0.0, GXM, GYM, GZM, AXM, AYM, AZM, 0.0, 0.0, CONCM, 1.0, AMOLFRAM2, RKM2, ACONTM, THETAM, PHIM, FLAG) + FlorenceN(3.0,3.0,f, SI, GAMMAI, SPIN, 1.0, DELTA2, TAURM, TAUVM, TAUMM2, DPARAM, EPARAM, 0.0, GXM, GYM, GZM, AXM, AYM, AZM, 0.0, 0.0, CONCM, 1.0, AMOLFRAM2, RKM2, ACONTM, THETAM, PHIM, FLAG);\\r\\n\\r\\n    return af;\\r\\n\\r\\n}\",\n");
                jsonBuilder.append("\"AuxDeclar\": \"double FlorenceN_fHD(), R1OSabh_fHD(), FlorenceN_fHD_SS()\",\n");
                break;
            default:
                throw new IllegalStateException("Unhandled Florence Arrhenius case: " + caseKey);
        }

        String dados = data.get("dados") != null ? data.get("dados").toString() : "";
        dados = dados.replace("\r\n", "\n").replace("\r", "\n");

        jsonBuilder.append("\"Dados\": \"")
                .append(dados
                        .replace("\\", "\\\\")
                        .replace("\"", "\\\"")
                        .replace("\n", "\\n"))
                .append("\",\n");

        List<String> tabs = new ArrayList<>();
        Object maybeArray = data.get("AllTabs");
        if (maybeArray instanceof List) {
            for (Object o : (List<?>) maybeArray) {
                if (o != null) tabs.add(String.valueOf(o));
            }
        }

        jsonBuilder.append("\"Tags\": [\n");
        for (int i = 0; i < tabs.size(); i++) {
            jsonBuilder.append("  \"")
                    .append(tabs.get(i).replace("\\", "\\\\").replace("\"", "\\\""))
                    .append("\"");
            if (i < tabs.size() - 1) jsonBuilder.append(",");
            jsonBuilder.append("\n");
        }
        jsonBuilder.append("],\n");

        String active = String.valueOf(data.getOrDefault("ActiveTab", ""));
        jsonBuilder.append("\"SelectedDataSet\": \"")
                .append(active.replace("\\", "\\\\").replace("\"", "\\\""))
                .append("\"\n");

        jsonBuilder.append("}\n");
        return jsonBuilder.toString();
    }


    @PostMapping("/saveTabData_florence_hybrid")
    @ResponseBody
    public ResponseEntity<Map<String, String>> saveTabData_florence_hybrid(@RequestBody Map<String, Object> data) {
        String jsonDir = "/home/ofe/public_html/json/";
        File directory = new File(jsonDir);
        if (!directory.exists()) directory.mkdirs();

        // FLAG logic kept: florence -> 1, modflorence -> 2
        // FLAG index taken from labels (23, or 22 when D discrete removes DDM)
        String variant   = String.valueOf(data.getOrDefault("Variant", "florence"));
        String modelFlag = "modflorence".equals(variant) ? "2" : "1";
        String[] labelArr = String.valueOf(data.getOrDefault("ParametersString", "")).split(",");
        for (int i = 0; i < labelArr.length; i++) {
            if ("FLAG".equals(labelArr[i].trim())) {
                data.put("F" + i, "Fix");
                data.put("Pval" + i, modelFlag);
                data.put("Pmin" + i, "");
                data.put("Pmax" + i, "");
                break;
            }
        }

        // *_florence_hybrid.json
        final String fileSuffix = "_" + variant + "_hybrid.json";

        File[] existing = directory.listFiles((dir, name) -> name.endsWith(fileSuffix));
        if (existing != null && existing.length > 0) {
            Arrays.sort(existing, Comparator.comparingLong(File::lastModified));
            existing[0].delete();
        }

        String timestamp = new SimpleDateFormat("yyyyMMdd_HHmm").format(new Date());
        String jsonFileName = timestamp + fileSuffix;
        String jsonFilePath = jsonDir + jsonFileName;

        try (FileWriter file = new FileWriter(jsonFilePath)) {
            file.write(generateJSON_florence_hybrid(data));
            return ResponseEntity.ok(Map.of("message", "Florence Hybrid data saved successfully.", "filename", jsonFileName));
        } catch (IOException e) {
            e.printStackTrace();
            return ResponseEntity.status(500).body(Map.of("message", "Failed to save Florence Hybrid data."));
        }
    }

    private String generateJSON_florence_hybrid(Map<String, Object> data) {
        StringBuilder jsonBuilder = new StringBuilder("{\n");

        String parametersStr = String.valueOf(data.getOrDefault("ParametersString", ""));

        // _corr rule: bounds dropped for every Fix parameter
        int k = 0;
        while (data.containsKey("F"+k) || data.containsKey("Pval"+k) || data.containsKey("Pmin"+k) || data.containsKey("Pmax"+k)) {
            String fValK   = String.valueOf(data.getOrDefault("F"+k, ""));
            boolean isFixK = "Fix".equalsIgnoreCase(fValK);
            jsonBuilder.append("\"F").append(k).append("\": \"").append(fValK).append("\",\n");
            jsonBuilder.append("\"Pval").append(k).append("\": \"").append(String.valueOf(data.getOrDefault("Pval"+k, ""))).append("\",\n");
            jsonBuilder.append("\"Pmin").append(k).append("\": \"").append(isFixK ? "" : String.valueOf(data.getOrDefault("Pmin"+k, ""))).append("\",\n");
            jsonBuilder.append("\"Pmax").append(k).append("\": \"").append(isFixK ? "" : String.valueOf(data.getOrDefault("Pmax"+k, ""))).append("\",\n");
            k++;
        }

        jsonBuilder.append("\"Traco0\": \"3-dashed\",\n");
        jsonBuilder.append("\"X\": \"f\",\n");
        jsonBuilder.append("\"Xmax\": \"1e+08\",\n");
        jsonBuilder.append("\"Xmin\": \"6000\",\n");
        jsonBuilder.append("\"Y\": \"R1\",\n");
        jsonBuilder.append("\"Ymax\": \"50\",\n");
        jsonBuilder.append("\"Ymin\": \"0\",\n");
        jsonBuilder.append("\"FitType\": \"Global\",\n");
        jsonBuilder.append("\"Func0\": \"\",\n");
        jsonBuilder.append("\"AscaleX\": \"yes\",\n");
        jsonBuilder.append("\"AscaleY\": \"yes\",\n");
        jsonBuilder.append("\"Cor0\": \"2-red\",\n");
        jsonBuilder.append("\"FitMethods\": \"simp scan min\",\n");
        jsonBuilder.append("\"Funcx0\": \"auto\",\n");
        jsonBuilder.append("\"Funcy0\": \"auto\",\n");
        jsonBuilder.append("\"T\": \"N\",\n");

        boolean ls  = Boolean.parseBoolean(String.valueOf(data.getOrDefault("ModelFree", "false")));
        boolean os  = Boolean.parseBoolean(String.valueOf(data.getOrDefault("OuterSphere", "false")));
        boolean ss  = Boolean.parseBoolean(String.valueOf(data.getOrDefault("SecondSphere", "false")));
        boolean dDiscrete = os && "Y".equals(String.valueOf(data.getOrDefault("Dmode", "X")));

        String caseKey = "FLORENCE"
                + (ls ? "+LS" : "")
                + (os ? "+FREED" : "")
                + (ss ? "+SS" : "")
                + (dDiscrete ? "+DDISCRETE" : "");

        jsonBuilder.append("\"Parameters\": \"").append(parametersStr).append("\",\n");

        switch (caseKey) {
            case "FLORENCE": // 1. Florence
                jsonBuilder.append("\"Function\": \"R1=FlorenceN_hybrid(f, N, par)\",\n");
                jsonBuilder.append("\"AuxCode\": \"#include <stdio.h>\\r\\n#include <math.h>\\r\\n#include <stdlib.h>\\r\\n#include <string.h>\\r\\n#include \\\"globals.h\\\"\\r\\n#include \\\"struct.h\\\"\\r\\n#include \\\"userlib.h\\\"\\r\\n#include \\\"ndata.h\\\"\\r\\n#include \\\"mixed.h\\\"\\r\\n\\r\\n#define pi 3.1415926\\r\\n\\r\\ndouble FlorenceN_hybrid(double f, double N, double *par);\\r\\ndouble FlorenceN_hybrid(double f, double N, double *par)\\r\\n{\\r\\n    double SI, GAMMAI, SPIN, DELTA2, TAURM, TAUVM, TAUMM, DPARAM, EPARAM, GXM, GYM, GZM, AXM, AYM, AZM, CONCM, RKM, DM, DDM, ACONTM, AMOLFRAM, THETAM, PHIM, FLAG, FN, af;\\r\\n\\r\\n    SI = par[1];\\r\\n    GAMMAI = par[2];\\r\\n    SPIN = par[3];\\r\\n    DELTA2 = par[4];   \\r\\n    TAURM = par[5];\\r\\n    TAUVM = par[6];\\r\\n    TAUMM = par[7];\\r\\n    DPARAM = par[8];\\r\\n    EPARAM = par[9];\\r\\n    GXM = par[10];\\r\\n    GYM = par[11];\\r\\n    GZM = par[12];\\r\\n    AXM = par[13];\\r\\n    AYM = par[14];\\r\\n    AZM = par[15];\\r\\n    CONCM = par[16];\\r\\n    RKM = par[17];\\r\\n    DM = par[18];\\r\\n    DDM = par[19];\\r\\n    ACONTM = par[20];\\r\\n    AMOLFRAM = par[21];\\r\\n    THETAM = par[22];\\r\\n    PHIM = par[23];\\r\\n    FLAG = par[24];\\r\\n    FN = par[25];\\r\\n\\r\\n    af = FlorenceN(1.0,3.0,f, SI, GAMMAI, SPIN, 1.0, DELTA2, TAURM, TAUVM, TAUMM, DPARAM, EPARAM, 0.0, GXM, GYM, GZM, AXM, AYM, AZM, DM, DDM, CONCM, 1.0, AMOLFRAM, RKM, ACONTM, THETAM, PHIM, FLAG) + FlorenceN(2.0,3.0,f, SI, GAMMAI, SPIN, 1.0, DELTA2, TAURM, TAUVM, TAUMM, DPARAM, EPARAM, 0.0, GXM, GYM, GZM, AXM, AYM, AZM, DM, DDM, CONCM, 1.0, AMOLFRAM, RKM, ACONTM, THETAM, PHIM, FLAG) + FlorenceN(3.0,3.0,f, SI, GAMMAI, SPIN, 1.0, DELTA2, TAURM, TAUVM, TAUMM, DPARAM, EPARAM, 0.0, GXM, GYM, GZM, AXM, AYM, AZM, DM, DDM, CONCM, 1.0, AMOLFRAM, RKM, ACONTM, THETAM, PHIM, FLAG);\\r\\n    \\r\\n    return af;\\r\\n}\\r\\n\\r\\ndouble R1OSabh_hybrid(double f, double N, double *par);\\r\\ndouble R1OSabh_hybrid(double f, double N, double *par)\\r\\n{\\r\\n    double CONCM, SPIN, DM, DDM, TAUVM, EVM, DELTA2, FN, af;\\r\\n\\r\\n    CONCM = par[16];\\r\\n    SPIN = par[3];\\r\\n    DM = par[18];\\r\\n    DDM = par[19];\\r\\n    TAUVM = par[6];\\r\\n    EVM = par[9];\\r\\n    DELTA2 = par[4];\\r\\n    FN = par[25];\\r\\n\\r\\n    af=R1OSabh(f, CONCM*1e3, SPIN, DM, DDM, TAUVM, pow(1.883636123e11*DELTA2, 2.0),FN);\\r\\n\\r\\n    return af;\\r\\n}\\r\\n\\r\\ndouble FlorenceN_hybrid_SS(double f, double N, double *par);\\r\\ndouble FlorenceN_hybrid_SS(double f, double N, double *par)\\r\\n{\\r\\n    double SI, GAMMAI, SPIN, DELTA2, TAURM, TAUVM, TAUMM2, DPARAM, EPARAM, GXM, GYM, GZM, AXM, AYM, AZM, CONCM, RKM2, DM, DDM, ACONTM, AMOLFRAM2, THETAM, PHIM, FLAG, FN, af;\\r\\n\\r\\n    SI = par[1];\\r\\n    GAMMAI = par[2];\\r\\n    SPIN = par[3];\\r\\n    DELTA2 = par[4];   \\r\\n    TAURM = par[5];\\r\\n    TAUVM = par[6];\\r\\n    TAUMM2 = par[26];\\r\\n    DPARAM = par[8];\\r\\n    EPARAM = par[9];\\r\\n    GXM = par[10];\\r\\n    GYM = par[11];\\r\\n    GZM = par[12];\\r\\n    AXM = par[13];\\r\\n    AYM = par[14];\\r\\n    AZM = par[15];\\r\\n    CONCM = par[16];\\r\\n    RKM2 = par[27];\\r\\n    DM = par[18];\\r\\n    DDM = par[19];\\r\\n    ACONTM = par[20];\\r\\n    AMOLFRAM2 = par[28];\\r\\n    THETAM = par[22];\\r\\n    PHIM = par[23];\\r\\n    FLAG = par[24];\\r\\n    FN = par[25];\\r\\n\\r\\n    af = FlorenceN(1.0,3.0,f, SI, GAMMAI, SPIN, 1.0, DELTA2, TAURM, TAUVM, TAUMM2, DPARAM, EPARAM, 0.0, GXM, GYM, GZM, AXM, AYM, AZM, DM, DDM, CONCM, 1.0, AMOLFRAM2, RKM2, ACONTM, THETAM, PHIM, FLAG) + FlorenceN(2.0,3.0,f, SI, GAMMAI, SPIN, 1.0, DELTA2, TAURM, TAUVM, TAUMM2, DPARAM, EPARAM, 0.0, GXM, GYM, GZM, AXM, AYM, AZM, DM, DDM, CONCM, 1.0, AMOLFRAM2, RKM2, ACONTM, THETAM, PHIM, FLAG) + FlorenceN(3.0,3.0,f, SI, GAMMAI, SPIN, 1.0, DELTA2, TAURM, TAUVM, TAUMM2, DPARAM, EPARAM, 0.0, GXM, GYM, GZM, AXM, AYM, AZM, DM, DDM, CONCM, 1.0, AMOLFRAM2, RKM2, ACONTM, THETAM, PHIM, FLAG);\\r\\n    \\r\\n    return af;\\r\\n}\",\n");
                jsonBuilder.append("\"AuxDeclar\": \"double FlorenceN_hybrid()\",\n");
                break;
            case "FLORENCE+FREED": // 2. Florence + Freed
                jsonBuilder.append("\"Function\": \"R1=FlorenceN_hybrid(f, N, par) \\\\+ R1OSabh_hybrid(f, N, par)\",\n");
                jsonBuilder.append("\"AuxCode\": \"#include <stdio.h>\\r\\n#include <math.h>\\r\\n#include <stdlib.h>\\r\\n#include <string.h>\\r\\n#include \\\"globals.h\\\"\\r\\n#include \\\"struct.h\\\"\\r\\n#include \\\"userlib.h\\\"\\r\\n#include \\\"ndata.h\\\"\\r\\n#include \\\"mixed.h\\\"\\r\\n\\r\\n#define pi 3.1415926\\r\\n\\r\\ndouble FlorenceN_hybrid(double f, double N, double *par);\\r\\ndouble FlorenceN_hybrid(double f, double N, double *par)\\r\\n{\\r\\n    double SI, GAMMAI, SPIN, DELTA2, TAURM, TAUVM, TAUMM, DPARAM, EPARAM, GXM, GYM, GZM, AXM, AYM, AZM, CONCM, RKM, DM, DDM, ACONTM, AMOLFRAM, THETAM, PHIM, FLAG, FN, af;\\r\\n\\r\\n    SI = par[1];\\r\\n    GAMMAI = par[2];\\r\\n    SPIN = par[3];\\r\\n    DELTA2 = par[4];   \\r\\n    TAURM = par[5];\\r\\n    TAUVM = par[6];\\r\\n    TAUMM = par[7];\\r\\n    DPARAM = par[8];\\r\\n    EPARAM = par[9];\\r\\n    GXM = par[10];\\r\\n    GYM = par[11];\\r\\n    GZM = par[12];\\r\\n    AXM = par[13];\\r\\n    AYM = par[14];\\r\\n    AZM = par[15];\\r\\n    CONCM = par[16];\\r\\n    RKM = par[17];\\r\\n    DM = par[18];\\r\\n    DDM = par[19];\\r\\n    ACONTM = par[20];\\r\\n    AMOLFRAM = par[21];\\r\\n    THETAM = par[22];\\r\\n    PHIM = par[23];\\r\\n    FLAG = par[24];\\r\\n    FN = par[25];\\r\\n\\r\\n    af = FlorenceN(1.0,3.0,f, SI, GAMMAI, SPIN, 1.0, DELTA2, TAURM, TAUVM, TAUMM, DPARAM, EPARAM, 0.0, GXM, GYM, GZM, AXM, AYM, AZM, DM, DDM, CONCM, 1.0, AMOLFRAM, RKM, ACONTM, THETAM, PHIM, FLAG) + FlorenceN(2.0,3.0,f, SI, GAMMAI, SPIN, 1.0, DELTA2, TAURM, TAUVM, TAUMM, DPARAM, EPARAM, 0.0, GXM, GYM, GZM, AXM, AYM, AZM, DM, DDM, CONCM, 1.0, AMOLFRAM, RKM, ACONTM, THETAM, PHIM, FLAG) + FlorenceN(3.0,3.0,f, SI, GAMMAI, SPIN, 1.0, DELTA2, TAURM, TAUVM, TAUMM, DPARAM, EPARAM, 0.0, GXM, GYM, GZM, AXM, AYM, AZM, DM, DDM, CONCM, 1.0, AMOLFRAM, RKM, ACONTM, THETAM, PHIM, FLAG);\\r\\n    \\r\\n    return af;\\r\\n}\\r\\n\\r\\ndouble R1OSabh_hybrid(double f, double N, double *par);\\r\\ndouble R1OSabh_hybrid(double f, double N, double *par)\\r\\n{\\r\\n    double CONCM, SPIN, DM, DDM, TAUVM, EVM, DELTA2, FN, af;\\r\\n\\r\\n    CONCM = par[16];\\r\\n    SPIN = par[3];\\r\\n    DM = par[18];\\r\\n    DDM = par[19];\\r\\n    TAUVM = par[6];\\r\\n    EVM = par[9];\\r\\n    DELTA2 = par[4];\\r\\n    FN = par[25];\\r\\n\\r\\n    af=R1OSabh(f, CONCM*1e3, SPIN, DM, DDM, TAUVM, pow(1.883636123e11*DELTA2, 2.0),FN);\\r\\n\\r\\n    return af;\\r\\n}\\r\\n\\r\\ndouble FlorenceN_hybrid_SS(double f, double N, double *par);\\r\\ndouble FlorenceN_hybrid_SS(double f, double N, double *par)\\r\\n{\\r\\n    double SI, GAMMAI, SPIN, DELTA2, TAURM, TAUVM, TAUMM2, DPARAM, EPARAM, GXM, GYM, GZM, AXM, AYM, AZM, CONCM, RKM2, DM, DDM, ACONTM, AMOLFRAM2, THETAM, PHIM, FLAG, FN, af;\\r\\n\\r\\n    SI = par[1];\\r\\n    GAMMAI = par[2];\\r\\n    SPIN = par[3];\\r\\n    DELTA2 = par[4];   \\r\\n    TAURM = par[5];\\r\\n    TAUVM = par[6];\\r\\n    TAUMM2 = par[26];\\r\\n    DPARAM = par[8];\\r\\n    EPARAM = par[9];\\r\\n    GXM = par[10];\\r\\n    GYM = par[11];\\r\\n    GZM = par[12];\\r\\n    AXM = par[13];\\r\\n    AYM = par[14];\\r\\n    AZM = par[15];\\r\\n    CONCM = par[16];\\r\\n    RKM2 = par[27];\\r\\n    DM = par[18];\\r\\n    DDM = par[19];\\r\\n    ACONTM = par[20];\\r\\n    AMOLFRAM2 = par[28];\\r\\n    THETAM = par[22];\\r\\n    PHIM = par[23];\\r\\n    FLAG = par[24];\\r\\n    FN = par[25];\\r\\n\\r\\n    af = FlorenceN(1.0,3.0,f, SI, GAMMAI, SPIN, 1.0, DELTA2, TAURM, TAUVM, TAUMM2, DPARAM, EPARAM, 0.0, GXM, GYM, GZM, AXM, AYM, AZM, DM, DDM, CONCM, 1.0, AMOLFRAM2, RKM2, ACONTM, THETAM, PHIM, FLAG) + FlorenceN(2.0,3.0,f, SI, GAMMAI, SPIN, 1.0, DELTA2, TAURM, TAUVM, TAUMM2, DPARAM, EPARAM, 0.0, GXM, GYM, GZM, AXM, AYM, AZM, DM, DDM, CONCM, 1.0, AMOLFRAM2, RKM2, ACONTM, THETAM, PHIM, FLAG) + FlorenceN(3.0,3.0,f, SI, GAMMAI, SPIN, 1.0, DELTA2, TAURM, TAUVM, TAUMM2, DPARAM, EPARAM, 0.0, GXM, GYM, GZM, AXM, AYM, AZM, DM, DDM, CONCM, 1.0, AMOLFRAM2, RKM2, ACONTM, THETAM, PHIM, FLAG);\\r\\n    \\r\\n    return af;\\r\\n}\",\n");
                jsonBuilder.append("\"AuxDeclar\": \"double FlorenceN_hybrid(), R1OSabh_hybrid()\",\n");
                break;
            case "FLORENCE+LS": // 3. Florence + Lipari-Szabo
                jsonBuilder.append("\"Function\": \"R1=FlorenceN4LS_hybrid(f, N, par)\",\n");
                jsonBuilder.append("\"AuxCode\": \"#include <stdio.h>\\r\\n#include <math.h>\\r\\n#include <stdlib.h>\\r\\n#include <string.h>\\r\\n#include \\\"globals.h\\\"\\r\\n#include \\\"struct.h\\\"\\r\\n#include \\\"userlib.h\\\"\\r\\n#include \\\"ndata.h\\\"\\r\\n#include \\\"mixed.h\\\"\\r\\n\\r\\n#define pi 3.1415926\\r\\n\\r\\ndouble FlorenceN4LS_hybrid(double f, double N, double *par);\\r\\ndouble FlorenceN4LS_hybrid(double f, double N, double *par)\\r\\n{\\r\\n    double SI, GAMMAI, SPIN, DELTA2, TAURM, TAUVM, TAUMM, DPARAM, EPARAM, GXM, GYM, GZM, AXM, AYM, AZM, CONCM, RKM, DM, DDM, ACONTM, AMOLFRAM, THETAM, PHIM, SLS, TAULM, FLAG, FN, af;\\r\\n\\r\\n    SI = par[1];\\r\\n    GAMMAI = par[2];\\r\\n    SPIN = par[3];\\r\\n    DELTA2 = par[4];   \\r\\n    TAURM = par[5];\\r\\n    TAUVM = par[6];\\r\\n    TAUMM = par[7];\\r\\n    DPARAM = par[8];\\r\\n    EPARAM = par[9];\\r\\n    GXM = par[10];\\r\\n    GYM = par[11];\\r\\n    GZM = par[12];\\r\\n    AXM = par[13];\\r\\n    AYM = par[14];\\r\\n    AZM = par[15];\\r\\n    CONCM = par[16];\\r\\n    RKM = par[17];\\r\\n    DM = par[18];\\r\\n    DDM = par[19];\\r\\n    ACONTM = par[20];\\r\\n    AMOLFRAM = par[21];\\r\\n    THETAM = par[22];\\r\\n    PHIM = par[23];\\r\\n    SLS = par[24];\\r\\n    TAULM = par[25];\\r\\n    FLAG = par[26];\\r\\n    FN = par[27];\\r\\n\\r\\n\\r\\n \\r\\n    af = SLS*FlorenceN(1.0,3.0,f, SI, GAMMAI, SPIN, 1.0, DELTA2, TAURM, TAUVM, TAUMM, DPARAM, EPARAM, 0.0, GXM, GYM, GZM, AXM, AYM, AZM, 0.0, 0.0, CONCM, 1.0, AMOLFRAM, RKM, ACONTM, THETAM, PHIM, FLAG) + (1-SLS)*FlorenceN4LS(1.0,3.0,f, SI, GAMMAI, SPIN, 1.0, DELTA2, TAULM, TAUVM, TAUMM, DPARAM, EPARAM, 0.0, GXM, GYM, GZM, AXM, AYM, AZM, 0.0, 0.0, CONCM, 1.0, AMOLFRAM, RKM, ACONTM, THETAM, PHIM, FLAG) + SLS*FlorenceN(2.0,3.0,f, SI, GAMMAI, SPIN, 1.0, DELTA2, TAURM, TAUVM, TAUMM, DPARAM, EPARAM, 0.0, GXM, GYM, GZM, AXM, AYM, AZM, 0.0, 0.0, CONCM, 1.0, AMOLFRAM, RKM, ACONTM, THETAM, PHIM, FLAG) + (1-SLS)*FlorenceN4LS(2.0,3.0,f, SI, GAMMAI, SPIN, 1.0, DELTA2, TAULM, TAUVM, TAUMM, DPARAM, EPARAM, 0.0, GXM, GYM, GZM, AXM, AYM, AZM, 0.0, 0.0, CONCM, 1.0, AMOLFRAM, RKM, ACONTM, THETAM, PHIM, FLAG) + SLS*FlorenceN(3.0,3.0,f, SI, GAMMAI, SPIN, 1.0, DELTA2, TAURM, TAUVM, TAUMM, DPARAM, EPARAM, 0.0, GXM, GYM, GZM, AXM, AYM, AZM, 0.0, 0.0, CONCM, 1.0, AMOLFRAM, RKM, ACONTM, THETAM, PHIM, FLAG) + (1-SLS)*FlorenceN4LS(3.0,3.0,f, SI, GAMMAI, SPIN, 1.0, DELTA2, TAULM, TAUVM, TAUMM, DPARAM, EPARAM, 0.0, GXM, GYM, GZM, AXM, AYM, AZM, 0.0, 0.0, CONCM, 1.0, AMOLFRAM, RKM, ACONTM, THETAM, PHIM, FLAG);\\r\\n    \\r\\n    return af;\\r\\n}\\r\\n\\r\\ndouble R1OSabh_hybrid(double f, double N, double *par);\\r\\ndouble R1OSabh_hybrid(double f, double N, double *par)\\r\\n{\\r\\n    double CONCM, SPIN, DM, DDM, TAUVM, DELTA2, FN, af;\\r\\n\\r\\n    CONCM = par[16];\\r\\n    SPIN = par[3];\\r\\n    DM = par[18];\\r\\n    DDM = par[19];\\r\\n    TAUVM = par[6];\\r\\n    DELTA2 = par[4];\\r\\n    FN = par[27];\\r\\n\\r\\n    af=R1OSabh(f, CONCM*1e3, SPIN, DM, DDM, TAUVM, pow(1.883636123e11*DELTA2, 2.0),FN);\\r\\n\\r\\n    return af;\\r\\n}\\r\\n\\r\\ndouble FlorenceN4LS_hybrid_SS(double f, double N, double *par);\\r\\ndouble FlorenceN4LS_hybrid_SS(double f, double N, double *par)\\r\\n{\\r\\n    double SI, GAMMAI, SPIN, DELTA2, TAURM, TAUVM, TAUMM2, DPARAM, EPARAM, GXM, GYM, GZM, AXM, AYM, AZM, CONCM, RKM2, DM, DDM, ACONTM, AMOLFRAM2, THETAM, PHIM, FLAG, FN, af;\\r\\n\\r\\n    SI = par[1];\\r\\n    GAMMAI = par[2];\\r\\n    SPIN = par[3];\\r\\n    DELTA2 = par[4];   \\r\\n    TAURM = par[5];\\r\\n    TAUVM = par[6];\\r\\n    TAUMM2 = par[28];\\r\\n    DPARAM = par[8];\\r\\n    EPARAM = par[9];\\r\\n    GXM = par[10];\\r\\n    GYM = par[11];\\r\\n    GZM = par[12];\\r\\n    AXM = par[13];\\r\\n    AYM = par[14];\\r\\n    AZM = par[15];\\r\\n    CONCM = par[16];\\r\\n    RKM2 = par[29];\\r\\n    DM = par[18];\\r\\n    DDM = par[19];\\r\\n    ACONTM = par[20];\\r\\n    AMOLFRAM2 = par[30];\\r\\n    THETAM = par[22];\\r\\n    PHIM = par[23];\\r\\n    FLAG = par[26];\\r\\n    FN = par[27];\\r\\n\\r\\n    af = FlorenceN(1.0,3.0,f, SI, GAMMAI, SPIN, 1.0, DELTA2, TAURM, TAUVM, TAUMM2, DPARAM, EPARAM, 0.0, GXM, GYM, GZM, AXM, AYM, AZM, 0.0, 0.0, CONCM, 1.0, AMOLFRAM2, RKM2, ACONTM, THETAM, PHIM, FLAG) + FlorenceN(2.0,3.0,f, SI, GAMMAI, SPIN, 1.0, DELTA2, TAURM, TAUVM, TAUMM2, DPARAM, EPARAM, 0.0, GXM, GYM, GZM, AXM, AYM, AZM, 0.0, 0.0, CONCM, 1.0, AMOLFRAM2, RKM2, ACONTM, THETAM, PHIM, FLAG) + FlorenceN(3.0,3.0,f, SI, GAMMAI, SPIN, 1.0, DELTA2, TAURM, TAUVM, TAUMM2, DPARAM, EPARAM, 0.0, GXM, GYM, GZM, AXM, AYM, AZM, 0.0, 0.0, CONCM, 1.0, AMOLFRAM2, RKM2, ACONTM, THETAM, PHIM, FLAG);\\r\\n    \\r\\n    return af;\\r\\n}\",\n");
                jsonBuilder.append("\"AuxDeclar\": \"double FlorenceN4LS_hybrid\",\n");
                break;
            case "FLORENCE+LS+FREED": // 4. Florence + Lipari-Szabo + Freed
                jsonBuilder.append("\"Function\": \"R1=FlorenceN4LS_hybrid(f, N, par) \\\\+ R1OSabh_hybrid(f, N, par)\",\n");
                jsonBuilder.append("\"AuxCode\": \"#include <stdio.h>\\r\\n#include <math.h>\\r\\n#include <stdlib.h>\\r\\n#include <string.h>\\r\\n#include \\\"globals.h\\\"\\r\\n#include \\\"struct.h\\\"\\r\\n#include \\\"userlib.h\\\"\\r\\n#include \\\"ndata.h\\\"\\r\\n#include \\\"mixed.h\\\"\\r\\n\\r\\n#define pi 3.1415926\\r\\n\\r\\ndouble FlorenceN4LS_hybrid(double f, double N, double *par);\\r\\ndouble FlorenceN4LS_hybrid(double f, double N, double *par)\\r\\n{\\r\\n    double SI, GAMMAI, SPIN, DELTA2, TAURM, TAUVM, TAUMM, DPARAM, EPARAM, GXM, GYM, GZM, AXM, AYM, AZM, CONCM, RKM, DM, DDM, ACONTM, AMOLFRAM, THETAM, PHIM, SLS, TAULM, FLAG, FN, af;\\r\\n\\r\\n    SI = par[1];\\r\\n    GAMMAI = par[2];\\r\\n    SPIN = par[3];\\r\\n    DELTA2 = par[4];   \\r\\n    TAURM = par[5];\\r\\n    TAUVM = par[6];\\r\\n    TAUMM = par[7];\\r\\n    DPARAM = par[8];\\r\\n    EPARAM = par[9];\\r\\n    GXM = par[10];\\r\\n    GYM = par[11];\\r\\n    GZM = par[12];\\r\\n    AXM = par[13];\\r\\n    AYM = par[14];\\r\\n    AZM = par[15];\\r\\n    CONCM = par[16];\\r\\n    RKM = par[17];\\r\\n    DM = par[18];\\r\\n    DDM = par[19];\\r\\n    ACONTM = par[20];\\r\\n    AMOLFRAM = par[21];\\r\\n    THETAM = par[22];\\r\\n    PHIM = par[23];\\r\\n    SLS = par[24];\\r\\n    TAULM = par[25];\\r\\n    FLAG = par[26];\\r\\n    FN = par[27];\\r\\n\\r\\n\\r\\n \\r\\n    af = SLS*FlorenceN(1.0,3.0,f, SI, GAMMAI, SPIN, 1.0, DELTA2, TAURM, TAUVM, TAUMM, DPARAM, EPARAM, 0.0, GXM, GYM, GZM, AXM, AYM, AZM, 0.0, 0.0, CONCM, 1.0, AMOLFRAM, RKM, ACONTM, THETAM, PHIM, FLAG) + (1-SLS)*FlorenceN4LS(1.0,3.0,f, SI, GAMMAI, SPIN, 1.0, DELTA2, TAULM, TAUVM, TAUMM, DPARAM, EPARAM, 0.0, GXM, GYM, GZM, AXM, AYM, AZM, 0.0, 0.0, CONCM, 1.0, AMOLFRAM, RKM, ACONTM, THETAM, PHIM, FLAG) + SLS*FlorenceN(2.0,3.0,f, SI, GAMMAI, SPIN, 1.0, DELTA2, TAURM, TAUVM, TAUMM, DPARAM, EPARAM, 0.0, GXM, GYM, GZM, AXM, AYM, AZM, 0.0, 0.0, CONCM, 1.0, AMOLFRAM, RKM, ACONTM, THETAM, PHIM, FLAG) + (1-SLS)*FlorenceN4LS(2.0,3.0,f, SI, GAMMAI, SPIN, 1.0, DELTA2, TAULM, TAUVM, TAUMM, DPARAM, EPARAM, 0.0, GXM, GYM, GZM, AXM, AYM, AZM, 0.0, 0.0, CONCM, 1.0, AMOLFRAM, RKM, ACONTM, THETAM, PHIM, FLAG) + SLS*FlorenceN(3.0,3.0,f, SI, GAMMAI, SPIN, 1.0, DELTA2, TAURM, TAUVM, TAUMM, DPARAM, EPARAM, 0.0, GXM, GYM, GZM, AXM, AYM, AZM, 0.0, 0.0, CONCM, 1.0, AMOLFRAM, RKM, ACONTM, THETAM, PHIM, FLAG) + (1-SLS)*FlorenceN4LS(3.0,3.0,f, SI, GAMMAI, SPIN, 1.0, DELTA2, TAULM, TAUVM, TAUMM, DPARAM, EPARAM, 0.0, GXM, GYM, GZM, AXM, AYM, AZM, 0.0, 0.0, CONCM, 1.0, AMOLFRAM, RKM, ACONTM, THETAM, PHIM, FLAG);\\r\\n    \\r\\n    return af;\\r\\n}\\r\\n\\r\\ndouble R1OSabh_hybrid(double f, double N, double *par);\\r\\ndouble R1OSabh_hybrid(double f, double N, double *par)\\r\\n{\\r\\n    double CONCM, SPIN, DM, DDM, TAUVM, DELTA2, FN, af;\\r\\n\\r\\n    CONCM = par[16];\\r\\n    SPIN = par[3];\\r\\n    DM = par[18];\\r\\n    DDM = par[19];\\r\\n    TAUVM = par[6];\\r\\n    DELTA2 = par[4];\\r\\n    FN = par[27];\\r\\n\\r\\n    af=R1OSabh(f, CONCM*1e3, SPIN, DM, DDM, TAUVM, pow(1.883636123e11*DELTA2, 2.0),FN);\\r\\n\\r\\n    return af;\\r\\n}\\r\\n\\r\\ndouble FlorenceN4LS_hybrid_SS(double f, double N, double *par);\\r\\ndouble FlorenceN4LS_hybrid_SS(double f, double N, double *par)\\r\\n{\\r\\n    double SI, GAMMAI, SPIN, DELTA2, TAURM, TAUVM, TAUMM2, DPARAM, EPARAM, GXM, GYM, GZM, AXM, AYM, AZM, CONCM, RKM2, DM, DDM, ACONTM, AMOLFRAM2, THETAM, PHIM, FLAG, FN, af;\\r\\n\\r\\n    SI = par[1];\\r\\n    GAMMAI = par[2];\\r\\n    SPIN = par[3];\\r\\n    DELTA2 = par[4];   \\r\\n    TAURM = par[5];\\r\\n    TAUVM = par[6];\\r\\n    TAUMM2 = par[28];\\r\\n    DPARAM = par[8];\\r\\n    EPARAM = par[9];\\r\\n    GXM = par[10];\\r\\n    GYM = par[11];\\r\\n    GZM = par[12];\\r\\n    AXM = par[13];\\r\\n    AYM = par[14];\\r\\n    AZM = par[15];\\r\\n    CONCM = par[16];\\r\\n    RKM2 = par[29];\\r\\n    DM = par[18];\\r\\n    DDM = par[19];\\r\\n    ACONTM = par[20];\\r\\n    AMOLFRAM2 = par[30];\\r\\n    THETAM = par[22];\\r\\n    PHIM = par[23];\\r\\n    FLAG = par[26];\\r\\n    FN = par[27];\\r\\n\\r\\n    af = FlorenceN(1.0,3.0,f, SI, GAMMAI, SPIN, 1.0, DELTA2, TAURM, TAUVM, TAUMM2, DPARAM, EPARAM, 0.0, GXM, GYM, GZM, AXM, AYM, AZM, 0.0, 0.0, CONCM, 1.0, AMOLFRAM2, RKM2, ACONTM, THETAM, PHIM, FLAG) + FlorenceN(2.0,3.0,f, SI, GAMMAI, SPIN, 1.0, DELTA2, TAURM, TAUVM, TAUMM2, DPARAM, EPARAM, 0.0, GXM, GYM, GZM, AXM, AYM, AZM, 0.0, 0.0, CONCM, 1.0, AMOLFRAM2, RKM2, ACONTM, THETAM, PHIM, FLAG) + FlorenceN(3.0,3.0,f, SI, GAMMAI, SPIN, 1.0, DELTA2, TAURM, TAUVM, TAUMM2, DPARAM, EPARAM, 0.0, GXM, GYM, GZM, AXM, AYM, AZM, 0.0, 0.0, CONCM, 1.0, AMOLFRAM2, RKM2, ACONTM, THETAM, PHIM, FLAG);\\r\\n    \\r\\n    return af;\\r\\n}\",\n");
                jsonBuilder.append("\"AuxDeclar\": \"double FlorenceN4LS_hybrid, R1OSabh_hybrid()\",\n");
                break;
            case "FLORENCE+SS": // 5. Florence + SS
                jsonBuilder.append("\"Function\": \"R1=FlorenceN_hybrid(f, N, par) \\\\+ FlorenceN_hybrid_SS(f, N, par)\",\n");
                jsonBuilder.append("\"AuxCode\": \"#include <stdio.h>\\r\\n#include <math.h>\\r\\n#include <stdlib.h>\\r\\n#include <string.h>\\r\\n#include \\\"globals.h\\\"\\r\\n#include \\\"struct.h\\\"\\r\\n#include \\\"userlib.h\\\"\\r\\n#include \\\"ndata.h\\\"\\r\\n#include \\\"mixed.h\\\"\\r\\n\\r\\n#define pi 3.1415926\\r\\n\\r\\ndouble FlorenceN_hybrid(double f, double N, double *par);\\r\\ndouble FlorenceN_hybrid(double f, double N, double *par)\\r\\n{\\r\\n    double SI, GAMMAI, SPIN, DELTA2, TAURM, TAUVM, TAUMM, DPARAM, EPARAM, GXM, GYM, GZM, AXM, AYM, AZM, CONCM, RKM, DM, DDM, ACONTM, AMOLFRAM, THETAM, PHIM, FLAG, FN, af;\\r\\n\\r\\n    SI = par[1];\\r\\n    GAMMAI = par[2];\\r\\n    SPIN = par[3];\\r\\n    DELTA2 = par[4];   \\r\\n    TAURM = par[5];\\r\\n    TAUVM = par[6];\\r\\n    TAUMM = par[7];\\r\\n    DPARAM = par[8];\\r\\n    EPARAM = par[9];\\r\\n    GXM = par[10];\\r\\n    GYM = par[11];\\r\\n    GZM = par[12];\\r\\n    AXM = par[13];\\r\\n    AYM = par[14];\\r\\n    AZM = par[15];\\r\\n    CONCM = par[16];\\r\\n    RKM = par[17];\\r\\n    DM = par[18];\\r\\n    DDM = par[19];\\r\\n    ACONTM = par[20];\\r\\n    AMOLFRAM = par[21];\\r\\n    THETAM = par[22];\\r\\n    PHIM = par[23];\\r\\n    FLAG = par[24];\\r\\n    FN = par[25];\\r\\n\\r\\n    af = FlorenceN(1.0,3.0,f, SI, GAMMAI, SPIN, 1.0, DELTA2, TAURM, TAUVM, TAUMM, DPARAM, EPARAM, 0.0, GXM, GYM, GZM, AXM, AYM, AZM, DM, DDM, CONCM, 1.0, AMOLFRAM, RKM, ACONTM, THETAM, PHIM, FLAG) + FlorenceN(2.0,3.0,f, SI, GAMMAI, SPIN, 1.0, DELTA2, TAURM, TAUVM, TAUMM, DPARAM, EPARAM, 0.0, GXM, GYM, GZM, AXM, AYM, AZM, DM, DDM, CONCM, 1.0, AMOLFRAM, RKM, ACONTM, THETAM, PHIM, FLAG) + FlorenceN(3.0,3.0,f, SI, GAMMAI, SPIN, 1.0, DELTA2, TAURM, TAUVM, TAUMM, DPARAM, EPARAM, 0.0, GXM, GYM, GZM, AXM, AYM, AZM, DM, DDM, CONCM, 1.0, AMOLFRAM, RKM, ACONTM, THETAM, PHIM, FLAG);\\r\\n    \\r\\n    return af;\\r\\n}\\r\\n\\r\\ndouble R1OSabh_hybrid(double f, double N, double *par);\\r\\ndouble R1OSabh_hybrid(double f, double N, double *par)\\r\\n{\\r\\n    double CONCM, SPIN, DM, DDM, TAUVM, EVM, DELTA2, FN, af;\\r\\n\\r\\n    CONCM = par[16];\\r\\n    SPIN = par[3];\\r\\n    DM = par[18];\\r\\n    DDM = par[19];\\r\\n    TAUVM = par[6];\\r\\n    EVM = par[9];\\r\\n    DELTA2 = par[4];\\r\\n    FN = par[25];\\r\\n\\r\\n    af=R1OSabh(f, CONCM*1e3, SPIN, DM, DDM, TAUVM, pow(1.883636123e11*DELTA2, 2.0),FN);\\r\\n\\r\\n    return af;\\r\\n}\\r\\n\\r\\ndouble FlorenceN_hybrid_SS(double f, double N, double *par);\\r\\ndouble FlorenceN_hybrid_SS(double f, double N, double *par)\\r\\n{\\r\\n    double SI, GAMMAI, SPIN, DELTA2, TAURM, TAUVM, TAUMM2, DPARAM, EPARAM, GXM, GYM, GZM, AXM, AYM, AZM, CONCM, RKM2, DM, DDM, ACONTM, AMOLFRAM2, THETAM, PHIM, FLAG, FN, af;\\r\\n\\r\\n    SI = par[1];\\r\\n    GAMMAI = par[2];\\r\\n    SPIN = par[3];\\r\\n    DELTA2 = par[4];   \\r\\n    TAURM = par[5];\\r\\n    TAUVM = par[6];\\r\\n    TAUMM2 = par[26];\\r\\n    DPARAM = par[8];\\r\\n    EPARAM = par[9];\\r\\n    GXM = par[10];\\r\\n    GYM = par[11];\\r\\n    GZM = par[12];\\r\\n    AXM = par[13];\\r\\n    AYM = par[14];\\r\\n    AZM = par[15];\\r\\n    CONCM = par[16];\\r\\n    RKM2 = par[27];\\r\\n    DM = par[18];\\r\\n    DDM = par[19];\\r\\n    ACONTM = par[20];\\r\\n    AMOLFRAM2 = par[28];\\r\\n    THETAM = par[22];\\r\\n    PHIM = par[23];\\r\\n    FLAG = par[24];\\r\\n    FN = par[25];\\r\\n\\r\\n    af = FlorenceN(1.0,3.0,f, SI, GAMMAI, SPIN, 1.0, DELTA2, TAURM, TAUVM, TAUMM2, DPARAM, EPARAM, 0.0, GXM, GYM, GZM, AXM, AYM, AZM, DM, DDM, CONCM, 1.0, AMOLFRAM2, RKM2, ACONTM, THETAM, PHIM, FLAG) + FlorenceN(2.0,3.0,f, SI, GAMMAI, SPIN, 1.0, DELTA2, TAURM, TAUVM, TAUMM2, DPARAM, EPARAM, 0.0, GXM, GYM, GZM, AXM, AYM, AZM, DM, DDM, CONCM, 1.0, AMOLFRAM2, RKM2, ACONTM, THETAM, PHIM, FLAG) + FlorenceN(3.0,3.0,f, SI, GAMMAI, SPIN, 1.0, DELTA2, TAURM, TAUVM, TAUMM2, DPARAM, EPARAM, 0.0, GXM, GYM, GZM, AXM, AYM, AZM, DM, DDM, CONCM, 1.0, AMOLFRAM2, RKM2, ACONTM, THETAM, PHIM, FLAG);\\r\\n    \\r\\n    return af;\\r\\n}\",\n");
                jsonBuilder.append("\"AuxDeclar\": \"double FlorenceN_hybrid(), FlorenceN_hybrid_SS()\",\n");
                break;
            case "FLORENCE+FREED+SS": // 6. Florence + Freed + SS
                jsonBuilder.append("\"Function\": \"R1=FlorenceN_hybrid(f, N, par) \\\\+ R1OSabh_hybrid(f, N, par) \\\\+ FlorenceN_hybrid_SS(f, N, par)\",\n");
                jsonBuilder.append("\"AuxCode\": \"#include <stdio.h>\\r\\n#include <math.h>\\r\\n#include <stdlib.h>\\r\\n#include <string.h>\\r\\n#include \\\"globals.h\\\"\\r\\n#include \\\"struct.h\\\"\\r\\n#include \\\"userlib.h\\\"\\r\\n#include \\\"ndata.h\\\"\\r\\n#include \\\"mixed.h\\\"\\r\\n\\r\\n#define pi 3.1415926\\r\\n\\r\\ndouble FlorenceN_hybrid(double f, double N, double *par);\\r\\ndouble FlorenceN_hybrid(double f, double N, double *par)\\r\\n{\\r\\n    double SI, GAMMAI, SPIN, DELTA2, TAURM, TAUVM, TAUMM, DPARAM, EPARAM, GXM, GYM, GZM, AXM, AYM, AZM, CONCM, RKM, DM, DDM, ACONTM, AMOLFRAM, THETAM, PHIM, FLAG, FN, af;\\r\\n\\r\\n    SI = par[1];\\r\\n    GAMMAI = par[2];\\r\\n    SPIN = par[3];\\r\\n    DELTA2 = par[4];   \\r\\n    TAURM = par[5];\\r\\n    TAUVM = par[6];\\r\\n    TAUMM = par[7];\\r\\n    DPARAM = par[8];\\r\\n    EPARAM = par[9];\\r\\n    GXM = par[10];\\r\\n    GYM = par[11];\\r\\n    GZM = par[12];\\r\\n    AXM = par[13];\\r\\n    AYM = par[14];\\r\\n    AZM = par[15];\\r\\n    CONCM = par[16];\\r\\n    RKM = par[17];\\r\\n    DM = par[18];\\r\\n    DDM = par[19];\\r\\n    ACONTM = par[20];\\r\\n    AMOLFRAM = par[21];\\r\\n    THETAM = par[22];\\r\\n    PHIM = par[23];\\r\\n    FLAG = par[24];\\r\\n    FN = par[25];\\r\\n\\r\\n    af = FlorenceN(1.0,3.0,f, SI, GAMMAI, SPIN, 1.0, DELTA2, TAURM, TAUVM, TAUMM, DPARAM, EPARAM, 0.0, GXM, GYM, GZM, AXM, AYM, AZM, DM, DDM, CONCM, 1.0, AMOLFRAM, RKM, ACONTM, THETAM, PHIM, FLAG) + FlorenceN(2.0,3.0,f, SI, GAMMAI, SPIN, 1.0, DELTA2, TAURM, TAUVM, TAUMM, DPARAM, EPARAM, 0.0, GXM, GYM, GZM, AXM, AYM, AZM, DM, DDM, CONCM, 1.0, AMOLFRAM, RKM, ACONTM, THETAM, PHIM, FLAG) + FlorenceN(3.0,3.0,f, SI, GAMMAI, SPIN, 1.0, DELTA2, TAURM, TAUVM, TAUMM, DPARAM, EPARAM, 0.0, GXM, GYM, GZM, AXM, AYM, AZM, DM, DDM, CONCM, 1.0, AMOLFRAM, RKM, ACONTM, THETAM, PHIM, FLAG);\\r\\n    \\r\\n    return af;\\r\\n}\\r\\n\\r\\ndouble R1OSabh_hybrid(double f, double N, double *par);\\r\\ndouble R1OSabh_hybrid(double f, double N, double *par)\\r\\n{\\r\\n    double CONCM, SPIN, DM, DDM, TAUVM, EVM, DELTA2, FN, af;\\r\\n\\r\\n    CONCM = par[16];\\r\\n    SPIN = par[3];\\r\\n    DM = par[18];\\r\\n    DDM = par[19];\\r\\n    TAUVM = par[6];\\r\\n    EVM = par[9];\\r\\n    DELTA2 = par[4];\\r\\n    FN = par[25];\\r\\n\\r\\n    af=R1OSabh(f, CONCM*1e3, SPIN, DM, DDM, TAUVM, pow(1.883636123e11*DELTA2, 2.0),FN);\\r\\n\\r\\n    return af;\\r\\n}\\r\\n\\r\\ndouble FlorenceN_hybrid_SS(double f, double N, double *par);\\r\\ndouble FlorenceN_hybrid_SS(double f, double N, double *par)\\r\\n{\\r\\n    double SI, GAMMAI, SPIN, DELTA2, TAURM, TAUVM, TAUMM2, DPARAM, EPARAM, GXM, GYM, GZM, AXM, AYM, AZM, CONCM, RKM2, DM, DDM, ACONTM, AMOLFRAM2, THETAM, PHIM, FLAG, FN, af;\\r\\n\\r\\n    SI = par[1];\\r\\n    GAMMAI = par[2];\\r\\n    SPIN = par[3];\\r\\n    DELTA2 = par[4];   \\r\\n    TAURM = par[5];\\r\\n    TAUVM = par[6];\\r\\n    TAUMM2 = par[26];\\r\\n    DPARAM = par[8];\\r\\n    EPARAM = par[9];\\r\\n    GXM = par[10];\\r\\n    GYM = par[11];\\r\\n    GZM = par[12];\\r\\n    AXM = par[13];\\r\\n    AYM = par[14];\\r\\n    AZM = par[15];\\r\\n    CONCM = par[16];\\r\\n    RKM2 = par[27];\\r\\n    DM = par[18];\\r\\n    DDM = par[19];\\r\\n    ACONTM = par[20];\\r\\n    AMOLFRAM2 = par[28];\\r\\n    THETAM = par[22];\\r\\n    PHIM = par[23];\\r\\n    FLAG = par[24];\\r\\n    FN = par[25];\\r\\n\\r\\n    af = FlorenceN(1.0,3.0,f, SI, GAMMAI, SPIN, 1.0, DELTA2, TAURM, TAUVM, TAUMM2, DPARAM, EPARAM, 0.0, GXM, GYM, GZM, AXM, AYM, AZM, DM, DDM, CONCM, 1.0, AMOLFRAM2, RKM2, ACONTM, THETAM, PHIM, FLAG) + FlorenceN(2.0,3.0,f, SI, GAMMAI, SPIN, 1.0, DELTA2, TAURM, TAUVM, TAUMM2, DPARAM, EPARAM, 0.0, GXM, GYM, GZM, AXM, AYM, AZM, DM, DDM, CONCM, 1.0, AMOLFRAM2, RKM2, ACONTM, THETAM, PHIM, FLAG) + FlorenceN(3.0,3.0,f, SI, GAMMAI, SPIN, 1.0, DELTA2, TAURM, TAUVM, TAUMM2, DPARAM, EPARAM, 0.0, GXM, GYM, GZM, AXM, AYM, AZM, DM, DDM, CONCM, 1.0, AMOLFRAM2, RKM2, ACONTM, THETAM, PHIM, FLAG);\\r\\n    \\r\\n    return af;\\r\\n}\",\n");
                jsonBuilder.append("\"AuxDeclar\": \"double FlorenceN_hybrid(), R1OSabh_hybrid(), FlorenceN_hybrid_SS()\",\n");
                break;
            case "FLORENCE+LS+SS": // 7. Florence + Lipari-Szabo + SS
                jsonBuilder.append("\"Function\": \"R1=FlorenceN4LS_hybrid(f, N, par) \\\\+ FlorenceN4LS_hybrid_SS(f, N, par)\",\n");
                jsonBuilder.append("\"AuxCode\": \"#include <stdio.h>\\r\\n#include <math.h>\\r\\n#include <stdlib.h>\\r\\n#include <string.h>\\r\\n#include \\\"globals.h\\\"\\r\\n#include \\\"struct.h\\\"\\r\\n#include \\\"userlib.h\\\"\\r\\n#include \\\"ndata.h\\\"\\r\\n#include \\\"mixed.h\\\"\\r\\n\\r\\n#define pi 3.1415926\\r\\n\\r\\ndouble FlorenceN4LS_hybrid(double f, double N, double *par);\\r\\ndouble FlorenceN4LS_hybrid(double f, double N, double *par)\\r\\n{\\r\\n    double SI, GAMMAI, SPIN, DELTA2, TAURM, TAUVM, TAUMM, DPARAM, EPARAM, GXM, GYM, GZM, AXM, AYM, AZM, CONCM, RKM, DM, DDM, ACONTM, AMOLFRAM, THETAM, PHIM, SLS, TAULM, FLAG, FN, af;\\r\\n\\r\\n    SI = par[1];\\r\\n    GAMMAI = par[2];\\r\\n    SPIN = par[3];\\r\\n    DELTA2 = par[4];   \\r\\n    TAURM = par[5];\\r\\n    TAUVM = par[6];\\r\\n    TAUMM = par[7];\\r\\n    DPARAM = par[8];\\r\\n    EPARAM = par[9];\\r\\n    GXM = par[10];\\r\\n    GYM = par[11];\\r\\n    GZM = par[12];\\r\\n    AXM = par[13];\\r\\n    AYM = par[14];\\r\\n    AZM = par[15];\\r\\n    CONCM = par[16];\\r\\n    RKM = par[17];\\r\\n    DM = par[18];\\r\\n    DDM = par[19];\\r\\n    ACONTM = par[20];\\r\\n    AMOLFRAM = par[21];\\r\\n    THETAM = par[22];\\r\\n    PHIM = par[23];\\r\\n    SLS = par[24];\\r\\n    TAULM = par[25];\\r\\n    FLAG = par[26];\\r\\n    FN = par[27];\\r\\n\\r\\n\\r\\n \\r\\n    af = SLS*FlorenceN(1.0,3.0,f, SI, GAMMAI, SPIN, 1.0, DELTA2, TAURM, TAUVM, TAUMM, DPARAM, EPARAM, 0.0, GXM, GYM, GZM, AXM, AYM, AZM, 0.0, 0.0, CONCM, 1.0, AMOLFRAM, RKM, ACONTM, THETAM, PHIM, FLAG) + (1-SLS)*FlorenceN4LS(1.0,3.0,f, SI, GAMMAI, SPIN, 1.0, DELTA2, TAULM, TAUVM, TAUMM, DPARAM, EPARAM, 0.0, GXM, GYM, GZM, AXM, AYM, AZM, 0.0, 0.0, CONCM, 1.0, AMOLFRAM, RKM, ACONTM, THETAM, PHIM, FLAG) + SLS*FlorenceN(2.0,3.0,f, SI, GAMMAI, SPIN, 1.0, DELTA2, TAURM, TAUVM, TAUMM, DPARAM, EPARAM, 0.0, GXM, GYM, GZM, AXM, AYM, AZM, 0.0, 0.0, CONCM, 1.0, AMOLFRAM, RKM, ACONTM, THETAM, PHIM, FLAG) + (1-SLS)*FlorenceN4LS(2.0,3.0,f, SI, GAMMAI, SPIN, 1.0, DELTA2, TAULM, TAUVM, TAUMM, DPARAM, EPARAM, 0.0, GXM, GYM, GZM, AXM, AYM, AZM, 0.0, 0.0, CONCM, 1.0, AMOLFRAM, RKM, ACONTM, THETAM, PHIM, FLAG) + SLS*FlorenceN(3.0,3.0,f, SI, GAMMAI, SPIN, 1.0, DELTA2, TAURM, TAUVM, TAUMM, DPARAM, EPARAM, 0.0, GXM, GYM, GZM, AXM, AYM, AZM, 0.0, 0.0, CONCM, 1.0, AMOLFRAM, RKM, ACONTM, THETAM, PHIM, FLAG) + (1-SLS)*FlorenceN4LS(3.0,3.0,f, SI, GAMMAI, SPIN, 1.0, DELTA2, TAULM, TAUVM, TAUMM, DPARAM, EPARAM, 0.0, GXM, GYM, GZM, AXM, AYM, AZM, 0.0, 0.0, CONCM, 1.0, AMOLFRAM, RKM, ACONTM, THETAM, PHIM, FLAG);\\r\\n    \\r\\n    return af;\\r\\n}\\r\\n\\r\\ndouble R1OSabh_hybrid(double f, double N, double *par);\\r\\ndouble R1OSabh_hybrid(double f, double N, double *par)\\r\\n{\\r\\n    double CONCM, SPIN, DM, DDM, TAUVM, DELTA2, FN, af;\\r\\n\\r\\n    CONCM = par[16];\\r\\n    SPIN = par[3];\\r\\n    DM = par[18];\\r\\n    DDM = par[19];\\r\\n    TAUVM = par[6];\\r\\n    DELTA2 = par[4];\\r\\n    FN = par[27];\\r\\n\\r\\n    af=R1OSabh(f, CONCM*1e3, SPIN, DM, DDM, TAUVM, pow(1.883636123e11*DELTA2, 2.0),FN);\\r\\n\\r\\n    return af;\\r\\n}\\r\\n\\r\\ndouble FlorenceN4LS_hybrid_SS(double f, double N, double *par);\\r\\ndouble FlorenceN4LS_hybrid_SS(double f, double N, double *par)\\r\\n{\\r\\n    double SI, GAMMAI, SPIN, DELTA2, TAURM, TAUVM, TAUMM2, DPARAM, EPARAM, GXM, GYM, GZM, AXM, AYM, AZM, CONCM, RKM2, DM, DDM, ACONTM, AMOLFRAM2, THETAM, PHIM, FLAG, FN, af;\\r\\n\\r\\n    SI = par[1];\\r\\n    GAMMAI = par[2];\\r\\n    SPIN = par[3];\\r\\n    DELTA2 = par[4];   \\r\\n    TAURM = par[5];\\r\\n    TAUVM = par[6];\\r\\n    TAUMM2 = par[28];\\r\\n    DPARAM = par[8];\\r\\n    EPARAM = par[9];\\r\\n    GXM = par[10];\\r\\n    GYM = par[11];\\r\\n    GZM = par[12];\\r\\n    AXM = par[13];\\r\\n    AYM = par[14];\\r\\n    AZM = par[15];\\r\\n    CONCM = par[16];\\r\\n    RKM2 = par[29];\\r\\n    DM = par[18];\\r\\n    DDM = par[19];\\r\\n    ACONTM = par[20];\\r\\n    AMOLFRAM2 = par[30];\\r\\n    THETAM = par[22];\\r\\n    PHIM = par[23];\\r\\n    FLAG = par[26];\\r\\n    FN = par[27];\\r\\n\\r\\n    af = FlorenceN(1.0,3.0,f, SI, GAMMAI, SPIN, 1.0, DELTA2, TAURM, TAUVM, TAUMM2, DPARAM, EPARAM, 0.0, GXM, GYM, GZM, AXM, AYM, AZM, 0.0, 0.0, CONCM, 1.0, AMOLFRAM2, RKM2, ACONTM, THETAM, PHIM, FLAG) + FlorenceN(2.0,3.0,f, SI, GAMMAI, SPIN, 1.0, DELTA2, TAURM, TAUVM, TAUMM2, DPARAM, EPARAM, 0.0, GXM, GYM, GZM, AXM, AYM, AZM, 0.0, 0.0, CONCM, 1.0, AMOLFRAM2, RKM2, ACONTM, THETAM, PHIM, FLAG) + FlorenceN(3.0,3.0,f, SI, GAMMAI, SPIN, 1.0, DELTA2, TAURM, TAUVM, TAUMM2, DPARAM, EPARAM, 0.0, GXM, GYM, GZM, AXM, AYM, AZM, 0.0, 0.0, CONCM, 1.0, AMOLFRAM2, RKM2, ACONTM, THETAM, PHIM, FLAG);\\r\\n    \\r\\n    return af;\\r\\n}\",\n");
                jsonBuilder.append("\"AuxDeclar\": \"double FlorenceN4LS_hybrid, FlorenceN4LS_hybrid_SS(()\",\n");
                break;
            case "FLORENCE+LS+FREED+SS": // 8. Florence + Lipari-Szabo + Freed + SS
                jsonBuilder.append("\"Function\": \"R1=FlorenceN4LS_hybrid(f, N, par) \\\\+ R1OSabh_hybrid(f, N, par) \\\\+ FlorenceN4LS_hybrid_SS(f, N, par)\",\n");
                jsonBuilder.append("\"AuxCode\": \"#include <stdio.h>\\r\\n#include <math.h>\\r\\n#include <stdlib.h>\\r\\n#include <string.h>\\r\\n#include \\\"globals.h\\\"\\r\\n#include \\\"struct.h\\\"\\r\\n#include \\\"userlib.h\\\"\\r\\n#include \\\"ndata.h\\\"\\r\\n#include \\\"mixed.h\\\"\\r\\n\\r\\n#define pi 3.1415926\\r\\n\\r\\ndouble FlorenceN4LS_hybrid(double f, double N, double *par);\\r\\ndouble FlorenceN4LS_hybrid(double f, double N, double *par)\\r\\n{\\r\\n    double SI, GAMMAI, SPIN, DELTA2, TAURM, TAUVM, TAUMM, DPARAM, EPARAM, GXM, GYM, GZM, AXM, AYM, AZM, CONCM, RKM, DM, DDM, ACONTM, AMOLFRAM, THETAM, PHIM, SLS, TAULM, FLAG, FN, af;\\r\\n\\r\\n    SI = par[1];\\r\\n    GAMMAI = par[2];\\r\\n    SPIN = par[3];\\r\\n    DELTA2 = par[4];   \\r\\n    TAURM = par[5];\\r\\n    TAUVM = par[6];\\r\\n    TAUMM = par[7];\\r\\n    DPARAM = par[8];\\r\\n    EPARAM = par[9];\\r\\n    GXM = par[10];\\r\\n    GYM = par[11];\\r\\n    GZM = par[12];\\r\\n    AXM = par[13];\\r\\n    AYM = par[14];\\r\\n    AZM = par[15];\\r\\n    CONCM = par[16];\\r\\n    RKM = par[17];\\r\\n    DM = par[18];\\r\\n    DDM = par[19];\\r\\n    ACONTM = par[20];\\r\\n    AMOLFRAM = par[21];\\r\\n    THETAM = par[22];\\r\\n    PHIM = par[23];\\r\\n    SLS = par[24];\\r\\n    TAULM = par[25];\\r\\n    FLAG = par[26];\\r\\n    FN = par[27];\\r\\n\\r\\n\\r\\n \\r\\n    af = SLS*FlorenceN(1.0,3.0,f, SI, GAMMAI, SPIN, 1.0, DELTA2, TAURM, TAUVM, TAUMM, DPARAM, EPARAM, 0.0, GXM, GYM, GZM, AXM, AYM, AZM, 0.0, 0.0, CONCM, 1.0, AMOLFRAM, RKM, ACONTM, THETAM, PHIM, FLAG) + (1-SLS)*FlorenceN4LS(1.0,3.0,f, SI, GAMMAI, SPIN, 1.0, DELTA2, TAULM, TAUVM, TAUMM, DPARAM, EPARAM, 0.0, GXM, GYM, GZM, AXM, AYM, AZM, 0.0, 0.0, CONCM, 1.0, AMOLFRAM, RKM, ACONTM, THETAM, PHIM, FLAG) + SLS*FlorenceN(2.0,3.0,f, SI, GAMMAI, SPIN, 1.0, DELTA2, TAURM, TAUVM, TAUMM, DPARAM, EPARAM, 0.0, GXM, GYM, GZM, AXM, AYM, AZM, 0.0, 0.0, CONCM, 1.0, AMOLFRAM, RKM, ACONTM, THETAM, PHIM, FLAG) + (1-SLS)*FlorenceN4LS(2.0,3.0,f, SI, GAMMAI, SPIN, 1.0, DELTA2, TAULM, TAUVM, TAUMM, DPARAM, EPARAM, 0.0, GXM, GYM, GZM, AXM, AYM, AZM, 0.0, 0.0, CONCM, 1.0, AMOLFRAM, RKM, ACONTM, THETAM, PHIM, FLAG) + SLS*FlorenceN(3.0,3.0,f, SI, GAMMAI, SPIN, 1.0, DELTA2, TAURM, TAUVM, TAUMM, DPARAM, EPARAM, 0.0, GXM, GYM, GZM, AXM, AYM, AZM, 0.0, 0.0, CONCM, 1.0, AMOLFRAM, RKM, ACONTM, THETAM, PHIM, FLAG) + (1-SLS)*FlorenceN4LS(3.0,3.0,f, SI, GAMMAI, SPIN, 1.0, DELTA2, TAULM, TAUVM, TAUMM, DPARAM, EPARAM, 0.0, GXM, GYM, GZM, AXM, AYM, AZM, 0.0, 0.0, CONCM, 1.0, AMOLFRAM, RKM, ACONTM, THETAM, PHIM, FLAG);\\r\\n    \\r\\n    return af;\\r\\n}\\r\\n\\r\\ndouble R1OSabh_hybrid(double f, double N, double *par);\\r\\ndouble R1OSabh_hybrid(double f, double N, double *par)\\r\\n{\\r\\n    double CONCM, SPIN, DM, DDM, TAUVM, DELTA2, FN, af;\\r\\n\\r\\n    CONCM = par[16];\\r\\n    SPIN = par[3];\\r\\n    DM = par[18];\\r\\n    DDM = par[19];\\r\\n    TAUVM = par[6];\\r\\n    DELTA2 = par[4];\\r\\n    FN = par[27];\\r\\n\\r\\n    af=R1OSabh(f, CONCM*1e3, SPIN, DM, DDM, TAUVM, pow(1.883636123e11*DELTA2, 2.0),FN);\\r\\n\\r\\n    return af;\\r\\n}\\r\\n\\r\\ndouble FlorenceN4LS_hybrid_SS(double f, double N, double *par);\\r\\ndouble FlorenceN4LS_hybrid_SS(double f, double N, double *par)\\r\\n{\\r\\n    double SI, GAMMAI, SPIN, DELTA2, TAURM, TAUVM, TAUMM2, DPARAM, EPARAM, GXM, GYM, GZM, AXM, AYM, AZM, CONCM, RKM2, DM, DDM, ACONTM, AMOLFRAM2, THETAM, PHIM, FLAG, FN, af;\\r\\n\\r\\n    SI = par[1];\\r\\n    GAMMAI = par[2];\\r\\n    SPIN = par[3];\\r\\n    DELTA2 = par[4];   \\r\\n    TAURM = par[5];\\r\\n    TAUVM = par[6];\\r\\n    TAUMM2 = par[28];\\r\\n    DPARAM = par[8];\\r\\n    EPARAM = par[9];\\r\\n    GXM = par[10];\\r\\n    GYM = par[11];\\r\\n    GZM = par[12];\\r\\n    AXM = par[13];\\r\\n    AYM = par[14];\\r\\n    AZM = par[15];\\r\\n    CONCM = par[16];\\r\\n    RKM2 = par[29];\\r\\n    DM = par[18];\\r\\n    DDM = par[19];\\r\\n    ACONTM = par[20];\\r\\n    AMOLFRAM2 = par[30];\\r\\n    THETAM = par[22];\\r\\n    PHIM = par[23];\\r\\n    FLAG = par[26];\\r\\n    FN = par[27];\\r\\n\\r\\n    af = FlorenceN(1.0,3.0,f, SI, GAMMAI, SPIN, 1.0, DELTA2, TAURM, TAUVM, TAUMM2, DPARAM, EPARAM, 0.0, GXM, GYM, GZM, AXM, AYM, AZM, 0.0, 0.0, CONCM, 1.0, AMOLFRAM2, RKM2, ACONTM, THETAM, PHIM, FLAG) + FlorenceN(2.0,3.0,f, SI, GAMMAI, SPIN, 1.0, DELTA2, TAURM, TAUVM, TAUMM2, DPARAM, EPARAM, 0.0, GXM, GYM, GZM, AXM, AYM, AZM, 0.0, 0.0, CONCM, 1.0, AMOLFRAM2, RKM2, ACONTM, THETAM, PHIM, FLAG) + FlorenceN(3.0,3.0,f, SI, GAMMAI, SPIN, 1.0, DELTA2, TAURM, TAUVM, TAUMM2, DPARAM, EPARAM, 0.0, GXM, GYM, GZM, AXM, AYM, AZM, 0.0, 0.0, CONCM, 1.0, AMOLFRAM2, RKM2, ACONTM, THETAM, PHIM, FLAG);\\r\\n    \\r\\n    return af;\\r\\n}\",\n");
                jsonBuilder.append("\"AuxDeclar\": \"double FlorenceN4LS_hybrid, R1OSabh_hybrid(), FlorenceN4LS_hybrid_SS(()\",\n");
                break;
            case "FLORENCE+FREED+DDISCRETE": // 9. Florence + Freed (D discrete)
                jsonBuilder.append("\"Function\": \"R1=TO BE ADDED, HYBRID FLORENCE+FREED+DDISCRETE\",\n");
                jsonBuilder.append("\"AuxCode\": \"TO BE ADDED, HYBRID FLORENCE+FREED+DDISCRETE,;\\r\\n}\",\n");
                jsonBuilder.append("\"AuxDeclar\": \"TO BE ADDED, HYBRID FLORENCE+FREED+DDISCRETE,;\\r\\n}\",\n");
                break;
            case "FLORENCE+LS+FREED+DDISCRETE": // 10. Florence + Lipari-Szabo + Freed (D discrete)
                jsonBuilder.append("\"Function\": \"R1=TO BE ADDED, HYBRID FLORENCE+LS+FREED+DDISCRETE\",\n");
                jsonBuilder.append("\"AuxCode\": \"TO BE ADDED, HYBRID FLORENCE+LS+FREED+DDISCRETE,;\\r\\n}\",\n");
                jsonBuilder.append("\"AuxDeclar\": \"TO BE ADDED, HYBRID FLORENCE+LS+FREED+DDISCRETE,;\\r\\n}\",\n");
                break;
            case "FLORENCE+LS+FREED+SS+DDISCRETE": // 11. Florence + Lipari-Szabo + Freed + SS (D discrete)
                jsonBuilder.append("\"Function\": \"R1=TO BE ADDED, HYBRID FLORENCE+LS+FREED+SS+DDISCRETE\",\n");
                jsonBuilder.append("\"AuxCode\": \"TO BE ADDED, HYBRID FLORENCE+LS+FREED+SS+DDISCRETE,;\\r\\n}\",\n");
                jsonBuilder.append("\"AuxDeclar\": \"TO BE ADDED, HYBRID FLORENCE+LS+FREED+SS+DDISCRETE,;\\r\\n}\",\n");
                break;
            case "FLORENCE+FREED+SS+DDISCRETE": // 12. Florence + Freed + SS (D discrete)
                jsonBuilder.append("\"Function\": \"R1=TO BE ADDED, HYBRID FLORENCE+FREED+SS+DDISCRETE\",\n");
                jsonBuilder.append("\"AuxCode\": \"TO BE ADDED, HYBRID FLORENCE+FREED+SS+DDISCRETE,;\\r\\n}\",\n");
                jsonBuilder.append("\"AuxDeclar\": \"TO BE ADDED, HYBRID FLORENCE+FREED+SS+DDISCRETE,;\\r\\n}\",\n");
                break;
            default:
                throw new IllegalStateException("Unhandled Florence Hybrid case: " + caseKey);
        }

        String dados = data.get("dados") != null ? data.get("dados").toString() : "";
        dados = dados.replace("\r\n", "\n").replace("\r", "\n");

        jsonBuilder.append("\"Dados\": \"")
                .append(dados
                        .replace("\\", "\\\\")
                        .replace("\"", "\\\"")
                        .replace("\n", "\\n"))
                .append("\",\n");

        List<String> tabs = new ArrayList<>();
        Object maybeArray = data.get("AllTabs");
        if (maybeArray instanceof List) {
            for (Object o : (List<?>) maybeArray) {
                if (o != null) tabs.add(String.valueOf(o));
            }
        }

        jsonBuilder.append("\"Tags\": [\n");
        for (int i = 0; i < tabs.size(); i++) {
            jsonBuilder.append("  \"")
                    .append(tabs.get(i).replace("\\", "\\\\").replace("\"", "\\\""))
                    .append("\"");
            if (i < tabs.size() - 1) jsonBuilder.append(",");
            jsonBuilder.append("\n");
        }
        jsonBuilder.append("],\n");

        String active = String.valueOf(data.getOrDefault("ActiveTab", ""));
        jsonBuilder.append("\"SelectedDataSet\": \"")
                .append(active.replace("\\", "\\\\").replace("\"", "\\\""))
                .append("\"\n");

        jsonBuilder.append("}\n");
        return jsonBuilder.toString();
    }

    @PostMapping("/saveTabData_modelfree")
    @ResponseBody
    public ResponseEntity<Map<String, String>> saveTabData_modelfree(
            @RequestBody Map<String, Object> data) {

        String jsonDir = "/home/ofe/public_html/json/";
        File directory = new File(jsonDir);
        if (!directory.exists()) directory.mkdirs();

        File[] existing = directory.listFiles((dir, name) -> name.endsWith("_modelfree.json"));
        if (existing != null && existing.length > 0) {
            Arrays.sort(existing, Comparator.comparingLong(File::lastModified));
            existing[0].delete();
        }

        String timestamp = new SimpleDateFormat("yyyyMMdd_HHmm").format(new Date());
        String jsonFileName = timestamp + "_modelfree.json";
        String jsonFilePath = jsonDir + jsonFileName;

        try (FileWriter file = new FileWriter(jsonFilePath)) {
            String jsonContent = generateJSON_modelfree(data);
            file.write(jsonContent);
            Map<String, String> response = new HashMap<>();
            response.put("message", "Data saved successfully.");
            response.put("filename", jsonFileName);
            return ResponseEntity.ok(response);
        } catch (IOException e) {
            e.printStackTrace();
            return ResponseEntity.status(500).body(Map.of("message", "Failed to save data."));
        }
    }

    @GetMapping("/data_modelfree")
    @ResponseBody
    private String generateJSON_modelfree(Map<String, Object> data) {
        StringBuilder jsonBuilder = new StringBuilder("{\n");

        // Number of blocks sent by the UI (1..5).
        // c_n rows are display-only and never saved.
        // Parameter index order:
        //   N1:  A(0) B(1) tau1(2)
        //   N2:  A(0) B(1) tau1(2) S21(3) tau2(4)
        //   N3:  A(0) B(1) tau1(2) S21(3) tau2(4) S22(5) tau3(6)
        //   N4:  ... S23(7) tau4(8)
        //   N5:  ... S24(9) tau5(10)
        int N = 1;
        try { N = Integer.parseInt(String.valueOf(data.getOrDefault("N", "1"))); } catch (Exception ignore) {}
        if (N < 1) N = 1;
        if (N > 5) N = 5;

        int paramCount = 2 + 1 + (N - 1) * 2; // A, B, tau1 + (S2+tau) per extra block

        for (int i = 0; i < paramCount; i++) {
            String keyF    = "F"    + i;
            String keyPval = "Pval" + i;
            String keyPmin = "Pmin" + i;
            String keyPmax = "Pmax" + i;

            String valueF    = String.valueOf(data.getOrDefault(keyF,    "Fix"));
            String valuePval = String.valueOf(data.getOrDefault(keyPval, "0"));
            String valuePmin = String.valueOf(data.getOrDefault(keyPmin, ""));
            String valuePmax = String.valueOf(data.getOrDefault(keyPmax, ""));

            boolean isFix  = "Fix".equalsIgnoreCase(valueF);
            String outPmin = isFix ? "" : valuePmin;
            String outPmax = isFix ? "" : valuePmax;

            jsonBuilder.append("\"").append(keyF).append("\": \"").append(valueF).append("\",\n");
            jsonBuilder.append("\"").append(keyPval).append("\": \"").append(valuePval).append("\",\n");
            jsonBuilder.append("\"").append(keyPmin).append("\": \"").append(outPmin).append("\",\n");
            jsonBuilder.append("\"").append(keyPmax).append("\": \"").append(outPmax).append("\",\n");
        }

        // Dados
        String dados = data.getOrDefault("Dados", "").toString();
        StringBuilder formattedDados = new StringBuilder();
        for (String line : dados.split("\\n")) {
            if (line.startsWith("#")) {
                formattedDados.append(line).append("\\n");
            } else {
                String[] parts = line.trim().split("\\s+");
                if (parts.length >= 3) {
                    try {
                        formattedDados.append(String.format("%s %s %s\\n", parts[0], parts[1], parts[2]));
                    } catch (Exception e) {
                        formattedDados.append(line).append("\\n");
                    }
                } else {
                    formattedDados.append(line).append("\\n");
                }
            }
        }
        jsonBuilder.append("\"Dados\": \"").append(formattedDados.toString()).append("\",\n");

        // Tags + SelectedDataSet
        @SuppressWarnings("unchecked")
        List<String> tags = (List<String>) data.getOrDefault("Tags", new ArrayList<>());
        jsonBuilder.append("\"Tags\": [");
        for (int j = 0; j < tags.size(); j++) {
            jsonBuilder.append("\"").append(escapeJsonString(tags.get(j))).append("\"");
            if (j < tags.size() - 1) jsonBuilder.append(", ");
        }
        jsonBuilder.append("],\n");
        String selectedDataSet = escapeJsonString(data.getOrDefault("SelectedDataSet", "").toString());
        jsonBuilder.append("\"SelectedDataSet\": \"").append(selectedDataSet.replace("./", "").replace(".txt", "")).append("\",\n");

        // Function and Parameters — fill in the strings for each N-case
        switch (N) {
            case 1:
                jsonBuilder.append("\"Function\": \"R1=A\\\\+BPP(f,B,tau1)\",\n");
                jsonBuilder.append("\"Parameters\": \"A,B,tau1\",\n");
                break;
            case 2:
                jsonBuilder.append("\"Function\": \"A\\\\+S21*BPP(f,B,tau1)\\\\+(1-S21)*BPP(f,B,tau2)\",\n");
                jsonBuilder.append("\"Parameters\": \"A,B,tau1,S21,tau2\",\n");
                break;
            case 3:
                jsonBuilder.append("\"Function\": \"R1=A\\\\+S21*BPP(f,B,tau1)\\\\+(S22*(1-S21))*BPP(f,B,tau2)\\\\+((1-S22)*(1-S21))*BPP(f,B,tau3)\",\n");
                jsonBuilder.append("\"Parameters\": \"A,B,tau1,S21,tau2,S22,tau3\",\n");
                break;
            case 4:
                jsonBuilder.append("\"Function\": \"R1=A\\\\+S21*BPP(f,B,tau1)\\\\+(S22*(1-S21))*BPP(f,B,tau2)\\\\+(S23*(1-S22)*(1-S21))*BPP(f,B,tau3)\\\\+((1-S23)*(1-S22)*(1-S21))*BPP(f,B,tau4)\",\n");
                jsonBuilder.append("\"Parameters\": \"A,B,tau1,S21,tau2,S22,tau3,S23,tau4\",\n");
                break;
            case 5:
                jsonBuilder.append("\"Function\": \"R1=A\\\\+S21*BPP(f,B,tau1)\\\\+(S22*(1-S21))*BPP(f,B,tau2)\\\\+(S23*(1-S22)*(1-S21))*BPP(f,B,tau3)\\\\+(S24*(1-S23)*(1-S22)*(1-S21))*BPP(f,B,tau4)\\\\+((1-S24)*(1-S23)*(1-S22)*(1-S21))*BPP(f,B,tau5)\",\n");
                jsonBuilder.append("\"Parameters\": \"A,B,tau1,S21,tau2,S22,tau3,S23,tau4,S24,tau5\",\n");
                break;
        }

        // Standard plot config
        jsonBuilder.append("\"FitType\": \"Individual\",\n");
        jsonBuilder.append("\"Num\": \"100\",\n");
        jsonBuilder.append("\"X\": \"f\",\n");
        jsonBuilder.append("\"Xmax\": \"1e+08\",\n");
        jsonBuilder.append("\"Xmin\": \"6000\",\n");
        jsonBuilder.append("\"Y\": \"R1\",\n");
        jsonBuilder.append("\"Ymax\": \"50\",\n");
        jsonBuilder.append("\"Ymin\": \"0\",\n");
        jsonBuilder.append("\"AscaleX\": \"no\",\n");
        jsonBuilder.append("\"AscaleY\": \"no\",\n");
        jsonBuilder.append("\"T\": \"N\",\n");
        jsonBuilder.append("\"Nome\": \"").append(escapeJsonString(data.getOrDefault("email", "").toString())).append("\"\n");
        jsonBuilder.append("}\n");

        return jsonBuilder.toString();
    }

    @GetMapping("/paramagnetic-arrhenius")
    public String paramag_arrhenius(Model model) {
        return "paramag_arrhenius";
    }



    @GetMapping("/paramagnetic-correlated")
    public String paramag_corr(Model model) {
        return "paramag_corr";
    }

    @GetMapping("/paramagnetic-indie")
    public String paramag_indie(Model model) {
        return "paramag_indie";
    }

    @GetMapping("/florence-indie")
    public String paramag_florence_indie(Model model) {
        return "paramag_florence_indie";
    }

    @GetMapping("/florence-hybrid")
    public String paramag_florence_hybrid(Model model) {
        return "paramag_florence_hybrid";
    }

    @GetMapping("/florence-arrhenius")
    public String paramag_florence_arrhenius(Model model) {
        return "paramag_florence_arrhenius";
    }

    @GetMapping("/modflorence-indie")
    public String paramag_modflorence_indie(Model model) {
        return "paramag_modflorence_indie";
    }

    @GetMapping("/navbar")
    public String navbar(Model model) {
        return "navbar";
    }

    @GetMapping("/diamagnetic-modelfree")
    public String diamag_ext_modelfree(Model model) {
        return "diamag_ext_modelfree";
    }

    @GetMapping("/files/list")
    @ResponseBody
    public ResponseEntity<List<String>> listFiles() {
        File folder = new File("/home/ofe/public_html/json/");
        File[] files = folder.listFiles((dir, name) -> name.endsWith(".json"));

        if (files != null) {
            List<String> fileNames = Arrays.stream(files)
                    .map(File::getName)
                    .collect(Collectors.toList());
            return ResponseEntity.ok(fileNames);
        } else {
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(Collections.emptyList());
        }
    }

//Alternative
//    @PostMapping("/fit")
//    public ResponseEntity<String> runFitScript() {
//        ObjectMapper mapper = new ObjectMapper();
//        String jsonDir = "/home/ofe/public_html/json/";
//        String curlBaseCommand = "curl -F \"file=@%s\" http://localhost:8142/fit -F \"logx=yes\" -F \"autox=yes\" -F \"reduced-chi2=yes\" -F \"R2=yes\" -F \"download=json\"";
//        // String curlBaseCommand = "onefite fit %s --logx --autox --download=json";
//
//        try {
//            Map<String, Object> allFittedResults = new HashMap<>();
//            File dir = new File(jsonDir);
//
//            if (!dir.exists() || !dir.isDirectory()) {
//                return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
//                        .body("JSON directory not found or not a directory: " + jsonDir);
//            }
//
//            for (int i = 1; i <= 10; i++) {
//
//                final int profileIndex = i;
//                File[] matches = dir.listFiles((d, name) ->
//                        name.matches("^\\d{8}_\\d{4}_indie_profile" + profileIndex + "\\.json$"));
//
//                if (matches == null || matches.length == 0) {
//                    System.out.println("No JSON files found for profile " + i);
//                    continue;
//                }
//
//                Arrays.sort(matches, Comparator.comparingLong(File::lastModified).reversed());
//                File profileFile = matches[0];
//
//                File tempFile = new File(jsonDir, "temp_" + profileFile.getName());
//
//                System.out.println("Fitting profile " + i + " using: " + profileFile.getName());
//
//                String command = String.format(curlBaseCommand, profileFile.getAbsolutePath());
//
//                command = command.replaceFirst("^curl\\s+", "curl -sS ");
//
//                System.out.println("Executing: " + command);
//
//                ProcessBuilder processBuilder = new ProcessBuilder("sh", "-c", command);
//                processBuilder.directory(dir);
//                processBuilder.redirectOutput(tempFile);
//                processBuilder.redirectErrorStream(false);
//                Process process = processBuilder.start();
//
//                currentFitProc.set(process);
//
//                try {
//                    BufferedReader errReader = new BufferedReader(new InputStreamReader(process.getErrorStream()));
//                    StringBuilder errOut = new StringBuilder();
//                    String line;
//                    while ((line = errReader.readLine()) != null) {
//                        errOut.append(line).append("\n");
//                    }
//
//                    int exitCode = process.waitFor();
//
//                    if (exitCode == 0 && tempFile.exists() && tempFile.length() > 0) {
//                        try {
//                            Map<String, Object> jsonContent = mapper.readValue(tempFile, Map.class);
//                            allFittedResults.put("profile" + i, jsonContent);
//
//                            java.nio.file.Files.move(
//                                    tempFile.toPath(),
//                                    profileFile.toPath(),
//                                    java.nio.file.StandardCopyOption.REPLACE_EXISTING,
//                                    java.nio.file.StandardCopyOption.ATOMIC_MOVE
//                            );
//
//                        } catch (IOException e) {
//                            String badJsonSnippet;
//                            try {
//                                badJsonSnippet = new String(java.nio.file.Files.readAllBytes(tempFile.toPath()));
//                            } catch (IOException ignored) {
//                                badJsonSnippet = "<could not read temp JSON>";
//                            }
//
//                            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
//                                    .body("Invalid JSON output for profile " + i
//                                            + ". Stderr:\n" + errOut
//                                            + "\nTemp JSON:\n" + badJsonSnippet);
//                        }
//                    } else {
//                        String tempPreview;
//                        try {
//                            tempPreview = tempFile.exists()
//                                    ? new String(java.nio.file.Files.readAllBytes(tempFile.toPath()))
//                                    : "<temp file not created>";
//                        } catch (IOException ignored) {
//                            tempPreview = "<could not read temp file>";
//                        }
//
//                        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
//                                .body("Error during fit operation for profile " + i
//                                        + ". Exit code: " + exitCode
//                                        + "\nStderr:\n" + errOut
//                                        + "\nTemp JSON:\n" + tempPreview);
//                    }
//
//                } finally {
//                    currentFitProc.compareAndSet(process, null);
//                }
//            }
//
//            return ResponseEntity.ok(mapper.writeValueAsString(allFittedResults));
//
//        } catch (InterruptedException e) {
//            Thread.currentThread().interrupt();
//            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
//                    .body("Exception during fit operation: interrupted");
//        } catch (IOException e) {
//            e.printStackTrace();
//            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
//                    .body("Exception during fit operation: " + e.getMessage());
//        }
//    }


    @PostMapping("/fit")
    public ResponseEntity<String> runFitScript() {
        ObjectMapper mapper = new ObjectMapper();
        String jsonDir = "/home/ofe/public_html/json/";
        String curlBaseCommand = "curl -F \"file=@%s\" http://localhost:8142/fit -F \"logx=yes\" -F \"autox=yes\" -F \"reduced-chi2=yes\" -F \"R2=yes\" -F \"download=json\"";
        // String curlBaseCommand = "onefite fit %s --logx --autox --download=json";

        try {
            Map<String, Object> allFittedResults = new HashMap<>();


            // Loop through the JSON files (assuming 10 profiles)
            for (int i = 1; i <= 10; i++) {
                // Generate timestamped JSON filename correctly
                String timestamp = new SimpleDateFormat("yyyyMMdd_HHmm").format(new Date());
                String jsonFileName = String.format("%s_indie_profile%d.json", timestamp, i);
                File profileFile = new File(jsonDir, jsonFileName);
                File tempFile = new File(jsonDir, "temp_" + jsonFileName);

                // Check if the profile file exists before proceeding
                if (!profileFile.exists()) {
                    System.out.println("Profile file not found: " + profileFile.getAbsolutePath());
                    continue; // Skip to next profile
                }

                // Build the cURL command
                String command = String.format(curlBaseCommand, profileFile.getAbsolutePath());
                System.out.println("Executing: " + command); // Debugging

                // Run the cURL command and redirect output to a temp file
                ProcessBuilder processBuilder = new ProcessBuilder("sh", "-c", command + " > " + tempFile.getAbsolutePath());
                processBuilder.directory(new File(jsonDir));
                processBuilder.redirectErrorStream(true);
                Process process = processBuilder.start();

                // ★ register process so /fit_cancel can kill it
                currentFitProc.set(process);

                try {
                    // Capture process output
                    BufferedReader reader = new BufferedReader(new InputStreamReader(process.getInputStream()));
                    StringBuilder output = new StringBuilder();
                    String line;
                    while ((line = reader.readLine()) != null) {
                        output.append(line).append("\n");
                    }

                    // Wait for the process to complete
                    int exitCode = process.waitFor();

                    if (exitCode == 0 && tempFile.exists() && tempFile.length() > 0) {
                        // Validate JSON before replacing the original file
                        try {
                            Map<String, Object> jsonContent = mapper.readValue(tempFile, Map.class);
                            allFittedResults.put("profile" + i, jsonContent);

                            // Replace original file with temp file
                            if (!tempFile.renameTo(profileFile)) {
                                System.err.println("Failed to rename temp file: " + tempFile.getName());
                            }
                        } catch (IOException e) {
                            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                                    .body("Invalid JSON output for profile " + i + ". Output:\n" + output);
                        }
                    } else {
                        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                                .body("Error during fit operation for profile " + i + ". Exit code: " + exitCode + "\nOutput: " + output);
                    }
                } finally {
                    // ★ always clear handle (whether success, error, or canceled)
                    currentFitProc.compareAndSet(process, null);
                }
            }

            // Return all fitted results
            return ResponseEntity.ok(mapper.writeValueAsString(allFittedResults));

        } catch (IOException | InterruptedException e) {
            e.printStackTrace();
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body("Exception during fit operation: " + e.getMessage());
        }
    }


    @PostMapping("/fit_florence")
    public ResponseEntity<String> fitFlorence(
            @RequestParam(value = "methods", required = false) List<String> methods) {
        return runFlorencesFit("florence", methods);
    }

    @PostMapping("/fit_modflorence")
    public ResponseEntity<String> fitModFlorence(
            @RequestParam(value = "methods", required = false) List<String> methods) {
        return runFlorencesFit("modflorence", methods);
    }


    private ResponseEntity<String> runFlorencesFit(String variant, List<String> methods) {
        ObjectMapper mapper = new ObjectMapper();
        String jsonDir = "/home/ofe/public_html/json/";
        String fitMethods = (methods == null || methods.isEmpty())
                ? "scan simp migrad"
                : String.join(" ", methods);
        String curlBaseCommand = "curl -F \"file=@%s\" http://localhost:8142/fit -F \"logx=yes\" -F \"fit-methods=" + fitMethods + "\" -F \"autox=yes\" -F \"reduced-chi2=yes\" -F \"R2=yes\" -F \"download=json\"";
        final String suffix = "_" + variant + "_indie.json";

        File dir = new File(jsonDir);
        if (!dir.exists()) dir.mkdirs();

        File tmpOut = null;

        try {
            // Newest *_<variant>_indie.json
            File[] florenceFiles = dir.listFiles((d, name) -> name.endsWith(suffix));
            if (florenceFiles == null || florenceFiles.length == 0) {
                return ResponseEntity.badRequest().body("No json file found.");
            }
            Arrays.sort(florenceFiles, Comparator.comparingLong(File::lastModified).reversed());
            File florenceFile = florenceFiles[0];

            tmpOut = new File(jsonDir, "temp_" + florenceFile.getName());
            String cmd = String.format(curlBaseCommand, florenceFile.getAbsolutePath()) + " > " + tmpOut.getAbsolutePath();

            System.out.println("Executing: " + cmd);

            ProcessBuilder pb = new ProcessBuilder("sh", "-c", cmd);
            pb.directory(dir);
            pb.redirectErrorStream(true);

            Process proc = pb.start();
            currentFitProc.set(proc);

            int exit;
            try {
                exit = proc.waitFor();
            } finally {
                currentFitProc.compareAndSet(proc, null);
            }
            System.out.println("fit finished successfully");

            if (exit != 0 || tmpOut.length() == 0) {
                // read any output (optional) to help debugging
                return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                        .body("Fit failed. Exit code: " + exit);
            }

            Map<String, Object> fitJson = mapper.readValue(tmpOut, Map.class);

            if (!tmpOut.renameTo(florenceFile)) {
                tmpOut.delete();
                return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                        .body("Failed to replace " + variant + " JSON file.");
            }


            Map<String, Object> wrapped = new HashMap<>();
            wrapped.put("profile1", fitJson);

            return ResponseEntity.ok(mapper.writeValueAsString(wrapped));



        } catch (Exception e) {
            e.printStackTrace();
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body("Exception during fit_" + variant + ": " + e.getMessage());
        } finally {
            // safety: if something threw after temp creation but before rename
            if (tmpOut != null && tmpOut.exists()) {
                try { tmpOut.delete(); } catch (Exception ignored) {}
            }
        }
    }

    @PostMapping("/fit_corr")
    public ResponseEntity<String> runMixedFit(@RequestParam(defaultValue = "no") String shared) {
        ObjectMapper mapper = new ObjectMapper();
        String jsonDir = "/home/ofe/public_html/json/";
        String hybridFlag = "yes".equalsIgnoreCase(shared) ? " -F \"hybrid=yes\"" : "";
        String curlBaseCommand = "curl -F \"file=@%s\" http://localhost:8142/fit -F \"logx=yes\" -F \"autox=yes\"" + hybridFlag + " -F \"reduced-chi2=yes\" -F \"R2=yes\" -F \"download=json\"";

        File dir = new File(jsonDir);
        if (!dir.exists()) dir.mkdirs();

        try {
            File[] mixedFiles = dir.listFiles((d, name) -> name.endsWith("_mixed.json"));
            if (mixedFiles == null || mixedFiles.length == 0) {
                return ResponseEntity.badRequest().body("No *_mixed.json file found.");
            }
            Arrays.sort(mixedFiles, Comparator.comparingLong(File::lastModified).reversed());
            File mixedFile = mixedFiles[0];

            File tmpOut = File.createTempFile("fit_", ".json", dir);
            String cmd = String.format(curlBaseCommand, mixedFile.getAbsolutePath()) + " > " + tmpOut.getAbsolutePath();

            System.out.println("Executing: " + cmd);

            ProcessBuilder pb = new ProcessBuilder("sh", "-c", cmd);
            pb.directory(dir);
            pb.redirectErrorStream(true);
            Process proc = pb.start();
            currentFitProc.set(proc);

            int exit;
            try {
                exit = proc.waitFor();
            } finally {
                currentFitProc.compareAndSet(proc, null);
            }
            System.out.println("fit_corr finished successfully");

            if (exit != 0 || tmpOut.length() == 0) {
                return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                        .body("Fit failed. Exit code: " + exit);
            }

            Map<String, Object> fitJson = mapper.readValue(tmpOut, Map.class);

            try {
                java.nio.file.Files.move(
                        tmpOut.toPath(),
                        mixedFile.toPath(),
                        java.nio.file.StandardCopyOption.REPLACE_EXISTING,
                        java.nio.file.StandardCopyOption.ATOMIC_MOVE
                );
            } catch (Exception atomicFail) {
                java.nio.file.Files.move(
                        tmpOut.toPath(),
                        mixedFile.toPath(),
                        java.nio.file.StandardCopyOption.REPLACE_EXISTING
                );
            }

            return ResponseEntity.ok(mapper.writeValueAsString(fitJson));

        } catch (Exception e) {
            e.printStackTrace();
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body("Exception during runMixedFit: " + e.getMessage());
        }
    }

    @PostMapping("/fit_svante")
    public ResponseEntity<String> runArrheniusFit(
            @RequestParam(value = "methods", required = false) List<String> methods) {
        ObjectMapper mapper = new ObjectMapper();
        String jsonDir = "/home/ofe/public_html/json/";
        String fitMethods = (methods == null || methods.isEmpty())
                ? "scan simp migrad"
                : String.join(" ", methods);
        String curlBaseCommand =
                "curl -F \"file=@%s\" http://localhost:8142/fit -F \"logx=yes\" -F \"fit-methods=" + fitMethods + "\" -F \"autox=yes\" -F \"hybrid=yes\" -F \"reduced-chi2=yes\" -F \"R2=yes\" -F \"download=json\"";

        File dir = new File(jsonDir);
        if (!dir.exists()) dir.mkdirs();

        try {
            // 1) newest *_arrhenius.json
            File[] arrheniusFiles = dir.listFiles((d, name) -> name.endsWith("_arrhenius.json"));
            if (arrheniusFiles == null || arrheniusFiles.length == 0) {
                return ResponseEntity.badRequest().body("No Svante found.");
            }
            Arrays.sort(arrheniusFiles, Comparator.comparingLong(File::lastModified).reversed());
            File arrFile = arrheniusFiles[0];

            // 2) create fit_ temp output just like /fit_corr
            File tmpOut = File.createTempFile("fit_", ".json", dir);
            String cmd = String.format(curlBaseCommand, arrFile.getAbsolutePath()) +
                    " > " + tmpOut.getAbsolutePath();

            System.out.println("Executing: " + cmd);

            ProcessBuilder pb = new ProcessBuilder("sh", "-c", cmd);
            pb.directory(dir);
            pb.redirectErrorStream(true);

            Process proc = pb.start();
            currentFitProc.set(proc);

            int exit;
            try {
                exit = proc.waitFor();
            } finally {
                currentFitProc.compareAndSet(proc, null);
            }

            System.out.println("fit_svante finished successfully");

            if (exit != 0 || tmpOut.length() == 0) {
                return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                        .body("Fit failed. Exit code: " + exit);
            }

            Map<String, Object> fitJson = mapper.readValue(tmpOut, Map.class);

            // 3) overwrite the arrhenius file exactly like mixedFile in /fit_corr
            try {
                java.nio.file.Files.move(
                        tmpOut.toPath(),
                        arrFile.toPath(),
                        java.nio.file.StandardCopyOption.REPLACE_EXISTING,
                        java.nio.file.StandardCopyOption.ATOMIC_MOVE
                );
            } catch (Exception atomicFail) {
                java.nio.file.Files.move(
                        tmpOut.toPath(),
                        arrFile.toPath(),
                        java.nio.file.StandardCopyOption.REPLACE_EXISTING
                );
            }

            return ResponseEntity.ok(mapper.writeValueAsString(fitJson));

        } catch (Exception e) {
            e.printStackTrace();
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body("Exception during runArrheniusFit: " + e.getMessage());
        }
    }


    @PostMapping("/fit_florence_svante")
    public ResponseEntity<String> runFlorenceArrheniusFit(
            @RequestParam(value = "methods", required = false) List<String> methods,
            @RequestParam(value = "variant", defaultValue = "florence") String variant) {
        ObjectMapper mapper = new ObjectMapper();
        String jsonDir = "/home/ofe/public_html/json/";
        String fitMethods = (methods == null || methods.isEmpty())
                ? "scan simp migrad"
                : String.join(" ", methods);
        String curlBaseCommand =
                "curl -F \"file=@%s\" http://localhost:8142/fit -F \"logx=yes\" -F \"fit-methods=" + fitMethods + "\" -F \"autox=yes\" -F \"hybrid=yes\" -F \"reduced-chi2=yes\" -F \"R2=yes\" -F \"download=json\"";

        final String suffix = "_" + variant + "_svante.json";

        File dir = new File(jsonDir);
        if (!dir.exists()) dir.mkdirs();

        try {
            // 1) newest *_<variant>_svante.json
            File[] files = dir.listFiles((d, name) -> name.endsWith(suffix));
            if (files == null || files.length == 0) {
                return ResponseEntity.badRequest().body("No *" + suffix + " found.");
            }
            Arrays.sort(files, Comparator.comparingLong(File::lastModified).reversed());
            File arrFile = files[0];

            // 2) temp output
            File tmpOut = File.createTempFile("fit_", ".json", dir);
            String cmd = String.format(curlBaseCommand, arrFile.getAbsolutePath()) +
                    " > " + tmpOut.getAbsolutePath();

            System.out.println("Executing: " + cmd);

            ProcessBuilder pb = new ProcessBuilder("sh", "-c", cmd);
            pb.directory(dir);
            pb.redirectErrorStream(true);

            Process proc = pb.start();
            currentFitProc.set(proc);

            int exit;
            try {
                exit = proc.waitFor();
            } finally {
                currentFitProc.compareAndSet(proc, null);
            }

            System.out.println("fit_florence_svante finished successfully");

            if (exit != 0 || tmpOut.length() == 0) {
                tmpOut.delete();
                return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                        .body("Fit failed. Exit code: " + exit);
            }

            Map<String, Object> fitJson = mapper.readValue(tmpOut, Map.class);

            // 3) overwrite the saved file with the fitted one
            try {
                java.nio.file.Files.move(
                        tmpOut.toPath(),
                        arrFile.toPath(),
                        java.nio.file.StandardCopyOption.REPLACE_EXISTING,
                        java.nio.file.StandardCopyOption.ATOMIC_MOVE
                );
            } catch (Exception atomicFail) {
                java.nio.file.Files.move(
                        tmpOut.toPath(),
                        arrFile.toPath(),
                        java.nio.file.StandardCopyOption.REPLACE_EXISTING
                );
            }

            return ResponseEntity.ok(mapper.writeValueAsString(fitJson));

        } catch (Exception e) {
            e.printStackTrace();
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body("Exception during runFlorenceArrheniusFit: " + e.getMessage());
        }
    }


    @PostMapping("/fit_florence_hybrid")
    public ResponseEntity<String> runFlorenceHybridFit(
            @RequestParam(value = "methods", required = false) List<String> methods,
            @RequestParam(value = "variant", defaultValue = "florence") String variant,
            @RequestParam(value = "shared", defaultValue = "no") String shared) {
        ObjectMapper mapper = new ObjectMapper();
        String jsonDir = "/home/ofe/public_html/json/";
        String fitMethods = (methods == null || methods.isEmpty())
                ? "scan simp migrad"
                : String.join(" ", methods);
        String hybridFlag = "yes".equalsIgnoreCase(shared) ? "-F \"hybrid=yes\" " : "";
        String curlBaseCommand =
                "curl -F \"file=@%s\" http://localhost:8142/fit -F \"logx=yes\" -F \"fit-methods=" + fitMethods + "\" -F \"autox=yes\" " + hybridFlag + " -F \"reduced-chi2=yes\" -F \"R2=yes\" -F \"download=json\"";

        final String suffix = "_" + variant + "_hybrid.json";

        File dir = new File(jsonDir);
        if (!dir.exists()) dir.mkdirs();

        try {
            // 1) newest *_<variant>_hybrid.json
            File[] files = dir.listFiles((d, name) -> name.endsWith(suffix));
            if (files == null || files.length == 0) {
                return ResponseEntity.badRequest().body("No *" + suffix + " found.");
            }
            Arrays.sort(files, Comparator.comparingLong(File::lastModified).reversed());
            File arrFile = files[0];

            // 2) temp output
            File tmpOut = File.createTempFile("fit_", ".json", dir);
            String cmd = String.format(curlBaseCommand, arrFile.getAbsolutePath()) +
                    " > " + tmpOut.getAbsolutePath();

            System.out.println("Executing: " + cmd);

            ProcessBuilder pb = new ProcessBuilder("sh", "-c", cmd);
            pb.directory(dir);
            pb.redirectErrorStream(true);

            Process proc = pb.start();
            currentFitProc.set(proc);

            int exit;
            try {
                exit = proc.waitFor();
            } finally {
                currentFitProc.compareAndSet(proc, null);
            }

            System.out.println("fit_florence_hybrid finished successfully");

            if (exit != 0 || tmpOut.length() == 0) {
                tmpOut.delete();
                return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                        .body("Fit failed. Exit code: " + exit);
            }

            Map<String, Object> fitJson = mapper.readValue(tmpOut, Map.class);

            // 3) overwrite the saved file with the fitted one
            try {
                java.nio.file.Files.move(
                        tmpOut.toPath(),
                        arrFile.toPath(),
                        java.nio.file.StandardCopyOption.REPLACE_EXISTING,
                        java.nio.file.StandardCopyOption.ATOMIC_MOVE
                );
            } catch (Exception atomicFail) {
                java.nio.file.Files.move(
                        tmpOut.toPath(),
                        arrFile.toPath(),
                        java.nio.file.StandardCopyOption.REPLACE_EXISTING
                );
            }

            return ResponseEntity.ok(mapper.writeValueAsString(fitJson));

        } catch (Exception e) {
            e.printStackTrace();
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body("Exception during runFlorenceHybridFit: " + e.getMessage());
        }
    }

    @PostMapping("/fit_modelfree")
    public ResponseEntity<String> runModelfree() {
        ObjectMapper mapper = new ObjectMapper();
        String jsonDir = "/home/ofe/public_html/json/";
        String curlBaseCommand = "curl -F \"file=@%s\" http://localhost:8142/fit -F \"logx=yes\" -F \"autox=yes\" -F \"reduced-chi2=yes\" -F \"R2=yes\" -F \"download=json\"";

        File dir = new File(jsonDir);
        if (!dir.exists()) dir.mkdirs();

        try {
            File[] files = dir.listFiles((d, name) -> name.endsWith("_modelfree.json"));
            if (files == null || files.length == 0) {
                return ResponseEntity.badRequest().body("No *_modelfree_indie.json file found.");
            }
            Arrays.sort(files, Comparator.comparingLong(File::lastModified).reversed());
            File inputFile = files[0];

            File tmpOut = File.createTempFile("fit_", ".json", dir);
            String cmd = String.format(curlBaseCommand, inputFile.getAbsolutePath()) + " > " + tmpOut.getAbsolutePath();

            System.out.println("Executing: " + cmd);

            ProcessBuilder pb = new ProcessBuilder("sh", "-c", cmd);
            pb.directory(dir);
            pb.redirectErrorStream(true);
            Process proc = pb.start();
            currentFitProc.set(proc);

            int exit;
            try {
                exit = proc.waitFor();
            } finally {
                currentFitProc.compareAndSet(proc, null);
            }

            if (exit != 0 || tmpOut.length() == 0) {
                return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                        .body("Fit failed. Exit code: " + exit);
            }

            Map<String, Object> fitJson = mapper.readValue(tmpOut, Map.class);

            try {
                java.nio.file.Files.move(
                        tmpOut.toPath(),
                        inputFile.toPath(),
                        java.nio.file.StandardCopyOption.REPLACE_EXISTING,
                        java.nio.file.StandardCopyOption.ATOMIC_MOVE
                );
            } catch (Exception atomicFail) {
                java.nio.file.Files.move(
                        tmpOut.toPath(),
                        inputFile.toPath(),
                        java.nio.file.StandardCopyOption.REPLACE_EXISTING
                );
            }

            return ResponseEntity.ok(mapper.writeValueAsString(fitJson));

        } catch (Exception e) {
            e.printStackTrace();
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body("Exception during runModelfree: " + e.getMessage());
        }
    }

    @PostMapping("/fit_cancel")
    public ResponseEntity<String> cancelAnyFit() {
        Process p = currentFitProc.getAndSet(null);
        if (p == null) return ResponseEntity.ok("{\"status\":\"no-process\"}");
        try {
            var h = p.toHandle();
            // graceful first
            h.descendants().forEach(ph -> { try { ph.destroy(); } catch (Exception ignored) {} });
            h.destroy();
            try { Thread.sleep(150); } catch (InterruptedException ignored) {}
            // force if needed
            h.descendants().forEach(ph -> { try { if (ph.isAlive()) ph.destroyForcibly(); } catch (Exception ignored) {} });
            if (h.isAlive()) h.destroyForcibly();

            System.out.println("Fit canceled");
            return ResponseEntity.ok("{\"status\":\"canceled\"}");
        } catch (Exception e) {
            e.printStackTrace();
            return ResponseEntity.status(500).body("{\"status\":\"error\",\"message\":\"" + e.getMessage() + "\"}");
        }
    }





}





