package com.bajonea.backend.dto.request;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
public class ItemCarritoRequestDTO {

    @NotNull
    private Integer productoId;

    @NotNull
    @Min(1)
    @Max(20)
    private Integer cantidad;

    @Size(max = 255)
    private String nota;
}
