{{- define "opendream-cloud.name" -}}
opendream-cloud
{{- end -}}

{{- define "opendream-cloud.labels" -}}
app.kubernetes.io/name: {{ include "opendream-cloud.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
helm.sh/chart: {{ printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" }}
{{- end -}}

{{- define "opendream-cloud.image" -}}
{{- $img := . -}}
{{- if $img.digest -}}
{{ printf "%s@%s" $img.repository $img.digest }}
{{- else -}}
{{ printf "%s:%s" $img.repository $img.tag }}
{{- end -}}
{{- end -}}

{{- define "opendream-cloud.workspaceDomain" -}}
{{- if .Values.operator.workspaceDomain -}}
{{ .Values.operator.workspaceDomain }}
{{- else -}}
{{ .Values.global.domain }}
{{- end -}}
{{- end -}}
