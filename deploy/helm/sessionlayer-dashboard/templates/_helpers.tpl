{{- define "sessionlayer-dashboard.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{- define "sessionlayer-dashboard.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{- define "sessionlayer-dashboard.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{- define "sessionlayer-dashboard.labels" -}}
helm.sh/chart: {{ include "sessionlayer-dashboard.chart" . }}
{{ include "sessionlayer-dashboard.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/component: dashboard
app.kubernetes.io/part-of: sessionlayer
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{- define "sessionlayer-dashboard.selectorLabels" -}}
app.kubernetes.io/name: {{ include "sessionlayer-dashboard.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{- define "sessionlayer-dashboard.serviceAccountName" -}}
{{- if .Values.serviceAccount.create }}
{{- default (include "sessionlayer-dashboard.fullname" .) .Values.serviceAccount.name }}
{{- else }}
{{- default "default" .Values.serviceAccount.name }}
{{- end }}
{{- end }}

{{/* A digest pins the exact bytes; a tag does not. Digest wins when set. */}}
{{- define "sessionlayer-dashboard.image" -}}
{{- if .Values.image.digest -}}
{{- printf "%s@%s" .Values.image.repository .Values.image.digest -}}
{{- else -}}
{{- printf "%s:%s" .Values.image.repository (default .Chart.AppVersion .Values.image.tag) -}}
{{- end -}}
{{- end }}
