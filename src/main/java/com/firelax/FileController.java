package com.firelax;

import org.springframework.core.io.Resource;
import org.springframework.core.io.UrlResource;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;

import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;

@RestController
public class FileController {

    private final String dynamicFolderPath = "/home/ofe/public_html/json/";

    @GetMapping("/files/{filename}")
    public ResponseEntity<Resource> getFile(@PathVariable String filename) {
        try {
            Path filePath = Paths.get(dynamicFolderPath).resolve(filename).normalize();

            // Check if file exists and is readable
            if (Files.exists(filePath) && Files.isReadable(filePath)) {
                Resource resource = new UrlResource(filePath.toUri());
                return ResponseEntity.ok().body(resource);
            } else {
                System.err.println("File not found or not readable: " + filePath.toString());
                return ResponseEntity.notFound().build();
            }
        } catch (Exception e) {
            System.err.println("Error accessing file: " + filename);
            e.printStackTrace();
            return ResponseEntity.internalServerError().build();
        }
    }
}

