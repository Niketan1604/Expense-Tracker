package com.flowmint.splitwise.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.web.SecurityFilterChain;

@Configuration
@EnableWebSecurity
public class SecurityConfig {

    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        http
                // CORS is fully handled by API Gateway (HTTP API CorsConfiguration in template.yaml).
                // The Spring Boot service is only reachable via the internal VPC Link — no browser
                // ever contacts it directly — so there is no need for Spring to add CORS headers.
                // Having Spring add its own CORS headers alongside API Gateway's would create
                // duplicate/conflicting Access-Control-Allow-* headers and break browsers.
                .cors(cors -> cors.disable())
                .csrf(csrf -> csrf.disable()) // Stateless REST API — no CSRF needed
                .authorizeHttpRequests(
                        auth -> auth.requestMatchers("/actuator/health")
                                .permitAll() // ECS health check — no token
                                .anyRequest()
                                .authenticated() // Everything else needs a valid JWT
                        )
                .oauth2ResourceServer(
                        oauth2 -> oauth2.jwt(
                                jwt -> {}) // Validates Cognito JWT using issuer-uri from application.properties
                        );

        return http.build();
    }
}
