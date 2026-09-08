package com.bajonea.backend;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication
public class BajoneaApplication {

	public static void main(String[] args) {
		SpringApplication.run(BajoneaApplication.class, args);
	}

	//python -m http.server 5501 --directory "C:\Users\diego\Documents\Bukle\Proyectos\Bajoneá\03. Implementación\frontend"
	//for /f "tokens=5" %a in ('netstat -aon ^| find ":8080" ^| find "LISTENING"') do taskkill /f /pid %a
}
