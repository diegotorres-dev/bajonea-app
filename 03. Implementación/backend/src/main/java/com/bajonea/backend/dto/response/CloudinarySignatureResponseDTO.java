package com.bajonea.backend.dto.response;

import lombok.Getter;

@Getter
public class CloudinarySignatureResponseDTO {

    private final String signature;
    private final long timestamp;
    private final String apiKey;
    private final String cloudName;
    private final String folder;

    public CloudinarySignatureResponseDTO(String signature, long timestamp, String apiKey, String cloudName, String folder) {
        this.signature = signature;
        this.timestamp = timestamp;
        this.apiKey = apiKey;
        this.cloudName = cloudName;
        this.folder = folder;
    }
}
